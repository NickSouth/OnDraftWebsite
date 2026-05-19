import { CreateAuthService } from "../../src/auth/AuthService";
import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";
import { createHash } from "node:crypto";
import type { IEmailService, SendEmailVerificationEmailInput } from "../../src/email/EmailService";
import type { IUserRepository } from "../../src/auth/UserRepository";

class CapturingEmailService implements IEmailService {
  sent: SendEmailVerificationEmailInput[] = [];

  async sendEmailVerificationEmail(input: SendEmailVerificationEmailInput): Promise<void> {
    this.sent.push(input);
  }
}

async function addVerificationFixture(
  users: IUserRepository,
  options: {
    rawToken: string;
    expiresAt: string;
    usedAt?: string | null;
    mailingListConsent?: boolean;
  },
) {
  await users.add({
    id: "user-verification",
    email: "verify@ondraft.test",
    emailVerifiedAt: null,
    displayName: "Verify Reader",
    password: "password123",
    role: "user",
    preferences: {
      theme: "light",
      fontSize: "small",
      bookmarks: [],
    },
  });

  const tokenHash = createHash("sha256").update(options.rawToken).digest("hex");
  const token = await users.addEmailVerificationToken({
    id: "verification-token",
    userId: "user-verification",
    tokenHash,
    expiresAt: options.expiresAt,
    createdAt: "2026-05-19T12:00:00.000Z",
  });

  if (token.ok && options.usedAt) {
    await users.markEmailVerificationTokenUsed(token.value.id, options.usedAt);
  }

  if (options.mailingListConsent) {
    await users.upsertMailingListSubscription({
      id: "subscription-verification",
      email: "verify@ondraft.test",
      userId: "user-verification",
      status: "pending",
      consentSource: "registration",
      consentTextVersion: "registration-v1",
      consentedAt: "2026-05-19T12:00:00.000Z",
      unsubscribedAt: null,
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    });
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

  it("verifies a valid token and subscribes pending mailing list consent", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);
    await addVerificationFixture(users, {
      rawToken: "valid-token",
      expiresAt: "2999-05-20T12:00:00.000Z",
      mailingListConsent: true,
    });

    const result = await service.verifyEmail({ token: "valid-token" });
    const user = await users.findByEmail("verify@ondraft.test");
    const subscription = await users.findMailingListSubscriptionByEmail("verify@ondraft.test");
    const token = await users.findEmailVerificationTokenByHash(
      createHash("sha256").update("valid-token").digest("hex"),
    );

    expect(result.ok).toBe(true);
    expect(user.ok).toBe(true);
    expect(subscription.ok).toBe(true);
    expect(token.ok).toBe(true);
    if (user.ok) {
      expect(user.value?.emailVerifiedAt).toBeTruthy();
    }
    if (subscription.ok) {
      expect(subscription.value?.status).toBe("subscribed");
      expect(subscription.value?.consentedAt).toBeTruthy();
    }
    if (token.ok) {
      expect(token.value?.usedAt).toBeTruthy();
    }
  });

  it("rejects expired verification tokens", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);
    await addVerificationFixture(users, {
      rawToken: "expired-token",
      expiresAt: "2000-05-20T12:00:00.000Z",
    });

    const result = await service.verifyEmail({ token: "expired-token" });
    const user = await users.findByEmail("verify@ondraft.test");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.message).toBe("We could not verify that email link. It may be expired or already used.");
    }
    if (user.ok) {
      expect(user.value?.emailVerifiedAt).toBeNull();
    }
  });

  it("rejects reused verification tokens", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);
    await addVerificationFixture(users, {
      rawToken: "used-token",
      expiresAt: "2999-05-20T12:00:00.000Z",
      usedAt: "2026-05-19T12:30:00.000Z",
    });

    const result = await service.verifyEmail({ token: "used-token" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.message).toBe("We could not verify that email link. It may be expired or already used.");
    }
  });

  it("rejects nonexistent verification tokens", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);

    const result = await service.verifyEmail({ token: "missing-token" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.message).toBe("We could not verify that email link. It may be expired or already used.");
    }
  });
});
