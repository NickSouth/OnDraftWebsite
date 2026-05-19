import { CreateAuthService } from "../../src/auth/AuthService";
import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";
import { createHash } from "node:crypto";
import type { IEmailService, SendEmailVerificationEmailInput } from "../../src/email/EmailService";

class CapturingEmailService implements IEmailService {
  sent: SendEmailVerificationEmailInput[] = [];

  async sendEmailVerificationEmail(input: SendEmailVerificationEmailInput): Promise<void> {
    this.sent.push(input);
  }
}

describe("AuthService", () => {
  it("authenticates a known demo user", async () => {
    const service = CreateAuthService(CreateInMemoryUserRepository());

    const result = await service.authenticate({
      email: "ryanmcwalter@ondraft.test",
      password: "password123",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.displayName).toBe("Ryan McWalter");
    }
  });

  it("rejects bad credentials without revealing which field was wrong", async () => {
    const service = CreateAuthService(CreateInMemoryUserRepository());

    const result = await service.authenticate({
      email: "ryanmcwalter@ondraft.test",
      password: "wrong-password",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("InvalidCredentials");
      expect(result.value.message).toBe("Invalid email or password.");
    }
  });

  it("validates email and password presence before checking the repository", async () => {
    const service = CreateAuthService(CreateInMemoryUserRepository());

    const missingEmail = await service.authenticate({
      email: "",
      password: "password123",
    });
    const missingPassword = await service.authenticate({
      email: "ryanmcwalter@ondraft.test",
      password: "   ",
    });

    expect(missingEmail.ok).toBe(false);
    expect(missingPassword.ok).toBe(false);
    if (!missingEmail.ok) {
      expect(missingEmail.value.message).toBe("Email is required.");
    }
    if (!missingPassword.ok) {
      expect(missingPassword.value.message).toBe("Password is required.");
    }
  });

  it("registers a new user", async () => {
    const service = CreateAuthService(CreateInMemoryUserRepository());

    const result = await service.register({
      displayName: "Draft Analyst",
      email: "draft@ondraft.test",
      password: "password123",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("draft@ondraft.test");
      expect(result.value.displayName).toBe("Draft Analyst");
      expect(result.value).not.toHaveProperty("token");
    }
  });

  it("stores registered users as unverified until a verification flow marks them", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);

    await service.register({
      displayName: "Draft Analyst",
      email: "draft@ondraft.test",
      password: "password123",
    });

    const persisted = await users.findByEmail("draft@ondraft.test");

    expect(persisted.ok).toBe(true);
    if (persisted.ok) {
      expect(persisted.value?.emailVerifiedAt).toBeNull();
    }
  });

  it("creates a hashed verification token and sends only the raw-token URL by email", async () => {
    const users = CreateInMemoryUserRepository();
    const email = new CapturingEmailService();
    const service = CreateAuthService(users, email, {
      provider: "logging",
      from: null,
      appBaseUrl: "https://ondraftfootball.com",
      resendApiKey: null,
      verificationTokenTtlHours: 1,
    });

    const result = await service.register({
      displayName: "Draft Analyst",
      email: "draft@ondraft.test",
      password: "password123",
    });

    expect(result.ok).toBe(true);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("draft@ondraft.test");

    const verificationUrl = new URL(email.sent[0].verificationUrl);
    const rawToken = verificationUrl.searchParams.get("token");
    expect(verificationUrl.origin).toBe("https://ondraftfootball.com");
    expect(verificationUrl.pathname).toBe("/verify-email");
    expect(rawToken).toBeTruthy();

    const tokenHash = createHash("sha256").update(rawToken ?? "").digest("hex");
    const persistedToken = await users.findEmailVerificationTokenByHash(tokenHash);

    expect(persistedToken.ok).toBe(true);
    if (persistedToken.ok) {
      expect(persistedToken.value?.tokenHash).toBe(tokenHash);
      expect(persistedToken.value?.tokenHash).not.toBe(rawToken);
      expect(persistedToken.value?.usedAt).toBeNull();
      const createdAt = new Date(persistedToken.value?.createdAt ?? "").getTime();
      const expiresAt = new Date(persistedToken.value?.expiresAt ?? "").getTime();
      expect(expiresAt - createdAt).toBe(60 * 60 * 1000);
    }
  });

  it("stores mailing list consent as pending when requested during registration", async () => {
    const users = CreateInMemoryUserRepository();
    const email = new CapturingEmailService();
    const service = CreateAuthService(users, email, {
      provider: "logging",
      from: null,
      appBaseUrl: "https://ondraftfootball.com",
      resendApiKey: null,
      verificationTokenTtlHours: 24,
    });

    await service.register({
      displayName: "Draft Analyst",
      email: "draft@ondraft.test",
      password: "password123",
      mailingListConsent: true,
    });

    const subscription = await users.findMailingListSubscriptionByEmail("draft@ondraft.test");

    expect(subscription.ok).toBe(true);
    if (subscription.ok) {
      expect(subscription.value?.status).toBe("pending");
      expect(subscription.value?.consentSource).toBe("registration");
      expect(subscription.value?.consentTextVersion).toBe("registration-v1");
      expect(subscription.value?.consentedAt).toBeTruthy();
      expect(subscription.value?.unsubscribedAt).toBeNull();
    }
  });
});
