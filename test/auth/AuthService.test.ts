import { CreateAuthService } from "../../src/auth/AuthService";
import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";
import { createHash } from "node:crypto";
import type {
  IEmailService,
  SendEmailVerificationEmailInput,
  SendPasswordResetEmailInput,
} from "../../src/email/EmailService";
import type { IUserRepository } from "../../src/auth/UserRepository";
import type { IEmailConfig } from "../../src/config/AppConfig";

class CapturingEmailService implements IEmailService {
  sent: SendEmailVerificationEmailInput[] = [];
  passwordResets: SendPasswordResetEmailInput[] = [];

  async sendEmailVerificationEmail(input: SendEmailVerificationEmailInput): Promise<void> {
    this.sent.push(input);
  }

  async sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
    this.passwordResets.push(input);
  }
}

function tokenFromVerificationUrl(verificationUrl: string): string {
  return new URL(verificationUrl).searchParams.get("token") ?? "";
}

function testEmailConfig(): IEmailConfig {
  return {
    provider: "logging",
    from: null,
    appBaseUrl: "https://ondraftfootball.com",
    resendApiKey: null,
    verificationTokenTtlHours: 24,
    passwordResetTokenTtlMinutes: 60,
    mailingListUnsubscribeSecret: "test-mailing-secret",
  };
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
    ban: null,
    createdAt: "2026-05-19T12:00:00.000Z",
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
      email: "ryan@ondraftfootball.com",
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
      email: "ryan@ondraftfootball.com",
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
      email: "ryan@ondraftfootball.com",
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
      confirmPassword: "password123",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("draft@ondraft.test");
      expect(result.value.displayName).toBe("Draft Analyst");
      expect(result.value).not.toHaveProperty("token");
    }
  });

  it("requires matching password confirmation during registration", async () => {
    const service = CreateAuthService(CreateInMemoryUserRepository());

    const missingConfirmation = await service.register({
      displayName: "Draft Analyst",
      email: "missing-confirm@ondraft.test",
      password: "password123",
      confirmPassword: "",
    });
    const mismatched = await service.register({
      displayName: "Draft Analyst",
      email: "mismatch@ondraft.test",
      password: "password123",
      confirmPassword: "different123",
    });

    expect(missingConfirmation.ok).toBe(false);
    expect(mismatched.ok).toBe(false);
    if (!missingConfirmation.ok) {
      expect(missingConfirmation.value.message).toBe("Please confirm your password.");
    }
    if (!mismatched.ok) {
      expect(mismatched.value.message).toBe("Passwords must match.");
    }
  });

  it("stores registered users as unverified until a verification flow marks them", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);

    await service.register({
      displayName: "Draft Analyst",
      email: "draft@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
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
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "test-mailing-secret",
    });

    const result = await service.register({
      displayName: "Draft Analyst",
      email: "draft@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
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
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "test-mailing-secret",
    });

    await service.register({
      displayName: "Draft Analyst",
      email: "draft@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
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
    if (result.ok) {
      expect(result.value.emailVerifiedAt).toBeTruthy();
      expect(result.value.email).toBe("verify@ondraft.test");
    }
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

  it("resends verification email for an unverified account without returning account details", async () => {
    const users = CreateInMemoryUserRepository();
    const email = new CapturingEmailService();
    const service = CreateAuthService(users, email, {
      provider: "logging",
      from: null,
      appBaseUrl: "https://ondraftfootball.com",
      resendApiKey: null,
      verificationTokenTtlHours: 24,
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "test-mailing-secret",
    });

    await service.register({
      displayName: "Draft Analyst",
      email: "draft@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
    });
    const originalToken = tokenFromVerificationUrl(email.sent[0].verificationUrl);
    const result = await service.requestEmailVerification({ email: "draft@ondraft.test" });
    const resentToken = tokenFromVerificationUrl(email.sent[1].verificationUrl);
    const oldTokenResult = await service.verifyEmail({ token: originalToken });
    const newTokenResult = await service.verifyEmail({ token: resentToken });

    expect(result.ok).toBe(true);
    expect(email.sent).toHaveLength(2);
    expect(email.sent[1].verificationUrl).toContain("https://ondraftfootball.com/verify-email?token=");
    expect(resentToken).not.toBe(originalToken);
    expect(oldTokenResult.ok).toBe(false);
    expect(newTokenResult.ok).toBe(true);
  });

  it("creates hashed password reset tokens and rejects unknown emails", async () => {
    const users = CreateInMemoryUserRepository();
    const email = new CapturingEmailService();
    const service = CreateAuthService(users, email, {
      ...testEmailConfig(),
      passwordResetTokenTtlMinutes: 30,
    });

    const known = await service.requestPasswordReset({ email: "ryan@ondraftfootball.com" });
    const unknown = await service.requestPasswordReset({ email: "missing@ondraft.test" });

    expect(known.ok).toBe(true);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.value.message).toBe("No OnDraft account exists for that email address.");
    }
    expect(email.passwordResets).toHaveLength(1);
    expect(email.passwordResets[0].to).toBe("ryan@ondraftfootball.com");

    const resetUrl = new URL(email.passwordResets[0].resetUrl);
    const rawToken = resetUrl.searchParams.get("token");
    expect(resetUrl.origin).toBe("https://ondraftfootball.com");
    expect(resetUrl.pathname).toBe("/reset-password");
    expect(rawToken).toBeTruthy();

    const tokenHash = createHash("sha256").update(rawToken ?? "").digest("hex");
    const persistedToken = await users.findPasswordResetTokenByHash(tokenHash);
    expect(persistedToken.ok).toBe(true);
    if (persistedToken.ok) {
      expect(persistedToken.value?.tokenHash).toBe(tokenHash);
      expect(persistedToken.value?.tokenHash).not.toBe(rawToken);
      expect(persistedToken.value?.usedAt).toBeNull();
      const createdAt = new Date(persistedToken.value?.createdAt ?? "").getTime();
      const expiresAt = new Date(persistedToken.value?.expiresAt ?? "").getTime();
      expect(expiresAt - createdAt).toBe(30 * 60 * 1000);
    }
  });

  it("resets password with a valid token and prevents token reuse", async () => {
    const users = CreateInMemoryUserRepository();
    const email = new CapturingEmailService();
    const service = CreateAuthService(users, email, testEmailConfig());

    await service.requestPasswordReset({ email: "ryan@ondraftfootball.com" });
    const token = new URL(email.passwordResets[0].resetUrl).searchParams.get("token") ?? "";

    const mismatch = await service.resetPassword({
      token,
      password: "new-password-123",
      confirmPassword: "different-password",
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.value.message).toBe("Passwords must match.");
    }

    const reset = await service.resetPassword({
      token,
      password: "new-password-123",
      confirmPassword: "new-password-123",
    });
    expect(reset.ok).toBe(true);

    const oldPassword = await service.authenticate({
      email: "ryan@ondraftfootball.com",
      password: "password123",
    });
    const newPassword = await service.authenticate({
      email: "ryan@ondraftfootball.com",
      password: "new-password-123",
    });
    const reused = await service.resetPassword({
      token,
      password: "another-password-123",
      confirmPassword: "another-password-123",
    });

    expect(oldPassword.ok).toBe(false);
    expect(newPassword.ok).toBe(true);
    expect(reused.ok).toBe(false);
    if (!reused.ok) {
      expect(reused.value.message).toBe("We could not reset that password. The link may be expired or already used.");
    }
  });

  it("accepts verification email requests for verified accounts without sending", async () => {
    const users = CreateInMemoryUserRepository();
    const email = new CapturingEmailService();
    const service = CreateAuthService(users, email, {
      provider: "logging",
      from: null,
      appBaseUrl: "https://ondraftfootball.com",
      resendApiKey: null,
      verificationTokenTtlHours: 24,
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "test-mailing-secret",
    });

    const result = await service.requestEmailVerification({ email: "ryan@ondraftfootball.com" });

    expect(result.ok).toBe(true);
    expect(email.sent).toHaveLength(0);
  });

  it("accepts verification email requests for unknown emails without sending", async () => {
    const users = CreateInMemoryUserRepository();
    const email = new CapturingEmailService();
    const service = CreateAuthService(users, email, {
      provider: "logging",
      from: null,
      appBaseUrl: "https://ondraftfootball.com",
      resendApiKey: null,
      verificationTokenTtlHours: 24,
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "test-mailing-secret",
    });

    const result = await service.requestEmailVerification({ email: "missing@ondraft.test" });

    expect(result.ok).toBe(true);
    expect(email.sent).toHaveLength(0);
  });

  it("bans a non-admin user with the selected duration", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);
    await service.register({
      displayName: "Moderated Reader",
      email: "moderated@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
    });
    const reader = await users.findByEmail("moderated@ondraft.test");
    expect(reader.ok).toBe(true);
    if (!reader.ok || !reader.value) return;

    const result = await service.banUser({
      userId: reader.value.id,
      bannedByUserId: "user-ryan",
      message: "Cooldown period.",
      duration: "1-month",
      now: new Date("2026-05-20T12:00:00.000Z"),
    });
    const stored = await users.findById(reader.value.id);

    expect(result.ok).toBe(true);
    expect(stored.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ban).toEqual({
        message: "Cooldown period.",
        bannedAt: "2026-05-20T12:00:00.000Z",
        expiresAt: "2026-06-20T12:00:00.000Z",
        bannedByUserId: "user-ryan",
      });
    }
    if (stored.ok) {
      expect(stored.value?.ban?.expiresAt).toBe("2026-06-20T12:00:00.000Z");
    }
  });

  it("stores permanent bans with no expiration", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);
    await service.register({
      displayName: "Permanent Reader",
      email: "permanent@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
    });
    const reader = await users.findByEmail("permanent@ondraft.test");
    expect(reader.ok).toBe(true);
    if (!reader.ok || !reader.value) return;

    const result = await service.banUser({
      userId: reader.value.id,
      bannedByUserId: "user-ryan",
      message: "Permanent moderation action.",
      duration: "permanent",
      now: new Date("2026-05-20T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ban?.expiresAt).toBeNull();
    }
  });

  it("returns active bans and ignores expired bans", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);
    await service.register({
      displayName: "Ban Status Reader",
      email: "ban-status@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
    });
    const reader = await users.findByEmail("ban-status@ondraft.test");
    expect(reader.ok).toBe(true);
    if (!reader.ok || !reader.value) return;

    await service.banUser({
      userId: reader.value.id,
      bannedByUserId: "user-ryan",
      message: "One day away.",
      duration: "1-day",
      now: new Date("2026-05-20T12:00:00.000Z"),
    });

    const active = await service.getActiveUserBan({
      userId: reader.value.id,
      now: new Date("2026-05-20T13:00:00.000Z"),
    });
    const expired = await service.getActiveUserBan({
      userId: reader.value.id,
      now: new Date("2026-05-21T12:00:00.000Z"),
    });

    expect(active.ok).toBe(true);
    expect(expired.ok).toBe(true);
    if (active.ok) {
      expect(active.value?.message).toBe("One day away.");
    }
    if (expired.ok) {
      expect(expired.value).toBeNull();
    }
  });

  it("unbans a user", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);
    await service.register({
      displayName: "Unban Reader",
      email: "unban@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
    });
    const reader = await users.findByEmail("unban@ondraft.test");
    expect(reader.ok).toBe(true);
    if (!reader.ok || !reader.value) return;

    await service.banUser({
      userId: reader.value.id,
      bannedByUserId: "user-ryan",
      message: "Temporary.",
      duration: "1-day",
      now: new Date("2026-05-20T12:00:00.000Z"),
    });
    const result = await service.unbanUser({ userId: reader.value.id });
    const active = await service.getActiveUserBan({ userId: reader.value.id });

    expect(result.ok).toBe(true);
    expect(active.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ban).toBeNull();
    }
    if (active.ok) {
      expect(active.value).toBeNull();
    }
  });

  it("includes ban status in the admin user list", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);
    await service.register({
      displayName: "Listed Ban Reader",
      email: "listed-ban@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
    });
    const reader = await users.findByEmail("listed-ban@ondraft.test");
    expect(reader.ok).toBe(true);
    if (!reader.ok || !reader.value) return;

    await service.banUser({
      userId: reader.value.id,
      bannedByUserId: "user-ryan",
      message: "Visible to admins.",
      duration: "1-year",
      now: new Date("2026-05-20T12:00:00.000Z"),
    });

    const usersList = await service.listAdminUsers();

    expect(usersList.ok).toBe(true);
    if (usersList.ok) {
      const listed = usersList.value.find((user) => user.email === "listed-ban@ondraft.test");
      expect(listed?.ban?.message).toBe("Visible to admins.");
      expect(listed?.activeBan?.message).toBe("Visible to admins.");
    }
  });

  it("rejects invalid or unsafe ban requests", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users);
    await service.register({
      displayName: "Unsafe Ban Reader",
      email: "unsafe-ban@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
    });
    await service.register({
      displayName: "Unsafe Ban Target",
      email: "unsafe-ban-target@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
    });
    const reader = await users.findByEmail("unsafe-ban@ondraft.test");
    const target = await users.findByEmail("unsafe-ban-target@ondraft.test");
    expect(reader.ok).toBe(true);
    expect(target.ok).toBe(true);
    if (!reader.ok || !reader.value || !target.ok || !target.value) return;

    const blankMessage = await service.banUser({
      userId: reader.value.id,
      bannedByUserId: "user-ryan",
      message: "   ",
      duration: "1-day",
    });
    const selfBan = await service.banUser({
      userId: "user-ryan",
      bannedByUserId: "user-ryan",
      message: "Nope.",
      duration: "1-day",
    });
    const adminTarget = await service.banUser({
      userId: "user-aleks",
      bannedByUserId: "user-ryan",
      message: "Nope.",
      duration: "1-day",
    });
    const nonAdminActor = await service.banUser({
      userId: target.value.id,
      bannedByUserId: reader.value.id,
      message: "Nope.",
      duration: "1-day",
    });
    const badDuration = await service.banUser({
      userId: reader.value.id,
      bannedByUserId: "user-ryan",
      message: "Nope.",
      duration: "forever" as never,
    });

    expect(blankMessage.ok).toBe(false);
    expect(selfBan.ok).toBe(false);
    expect(adminTarget.ok).toBe(false);
    expect(nonAdminActor.ok).toBe(false);
    expect(badDuration.ok).toBe(false);
    if (!blankMessage.ok) expect(blankMessage.value.message).toBe("Ban message is required.");
    if (!selfBan.ok) expect(selfBan.value.message).toBe("Admins cannot ban themselves.");
    if (!adminTarget.ok) expect(adminTarget.value.message).toBe("Admin users cannot be banned.");
    if (!nonAdminActor.ok) expect(nonAdminActor.value.message).toBe("Only admins can ban users.");
    if (!badDuration.ok) expect(badDuration.value.message).toBe("Ban duration must be one day, one month, one year, or permanent.");
  });

  it("unsubscribes a mailing list subscription with a valid token", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users, new CapturingEmailService(), testEmailConfig());
    await users.upsertMailingListSubscription({
      id: "subscription-unsubscribe",
      email: "reader@ondraft.test",
      userId: null,
      status: "subscribed",
      consentSource: "registration",
      consentTextVersion: "registration-v1",
      consentedAt: "2026-05-19T12:00:00.000Z",
      unsubscribedAt: null,
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    });

    const unsubscribeUrl = await service.createMailingListUnsubscribeUrl({ email: "reader@ondraft.test" });
    expect(unsubscribeUrl.ok).toBe(true);
    if (!unsubscribeUrl.ok || !unsubscribeUrl.value) return;

    const result = await service.unsubscribeMailingList({
      token: new URL(unsubscribeUrl.value).searchParams.get("token") ?? "",
    });
    const subscription = await users.findMailingListSubscriptionByEmail("reader@ondraft.test");

    expect(result.ok).toBe(true);
    expect(subscription.ok).toBe(true);
    if (subscription.ok) {
      expect(subscription.value?.status).toBe("unsubscribed");
      expect(subscription.value?.unsubscribedAt).toBeTruthy();
    }
  });

  it("allows repeated mailing list unsubscribe without changing suppression status", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users, new CapturingEmailService(), testEmailConfig());
    await users.upsertMailingListSubscription({
      id: "subscription-repeat-unsubscribe",
      email: "repeat@ondraft.test",
      userId: null,
      status: "subscribed",
      consentSource: "registration",
      consentTextVersion: "registration-v1",
      consentedAt: "2026-05-19T12:00:00.000Z",
      unsubscribedAt: null,
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    });
    const unsubscribeUrl = await service.createMailingListUnsubscribeUrl({ email: "repeat@ondraft.test" });
    expect(unsubscribeUrl.ok).toBe(true);
    if (!unsubscribeUrl.ok || !unsubscribeUrl.value) return;
    const token = new URL(unsubscribeUrl.value).searchParams.get("token") ?? "";

    const first = await service.unsubscribeMailingList({ token });
    const afterFirst = await users.findMailingListSubscriptionByEmail("repeat@ondraft.test");
    const second = await service.unsubscribeMailingList({ token });
    const afterSecond = await users.findMailingListSubscriptionByEmail("repeat@ondraft.test");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (afterFirst.ok && afterSecond.ok) {
      expect(afterSecond.value?.status).toBe("unsubscribed");
      expect(afterSecond.value?.unsubscribedAt).toBe(afterFirst.value?.unsubscribedAt);
    }
  });

  it("rejects invalid mailing list unsubscribe tokens", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users, new CapturingEmailService(), testEmailConfig());

    const result = await service.unsubscribeMailingList({ token: "not-a-real-token" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.message).toBe("We could not process that unsubscribe link.");
    }
  });

  it("does not re-subscribe suppressed emails during registration without new consent", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users, new CapturingEmailService(), testEmailConfig());
    await users.upsertMailingListSubscription({
      id: "subscription-suppressed",
      email: "suppressed@ondraft.test",
      userId: null,
      status: "unsubscribed",
      consentSource: "registration",
      consentTextVersion: "registration-v1",
      consentedAt: "2026-05-19T12:00:00.000Z",
      unsubscribedAt: "2026-05-19T12:30:00.000Z",
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:30:00.000Z",
    });

    await service.register({
      displayName: "Suppressed Reader",
      email: "suppressed@ondraft.test",
      password: "password123",
      confirmPassword: "password123",
    });
    const subscription = await users.findMailingListSubscriptionByEmail("suppressed@ondraft.test");

    expect(subscription.ok).toBe(true);
    if (subscription.ok) {
      expect(subscription.value?.status).toBe("unsubscribed");
      expect(subscription.value?.unsubscribedAt).toBe("2026-05-19T12:30:00.000Z");
    }
  });

  it("exports only subscribed marketing emails with consent metadata", async () => {
    const users = CreateInMemoryUserRepository();
    const service = CreateAuthService(users, new CapturingEmailService(), testEmailConfig());
    await users.upsertMailingListSubscription({
      id: "subscription-subscribed",
      email: "subscribed@ondraft.test",
      userId: "user-subscribed",
      status: "subscribed",
      consentSource: "registration",
      consentTextVersion: "registration-v1",
      consentedAt: "2026-05-19T12:00:00.000Z",
      unsubscribedAt: null,
      createdAt: "2026-05-19T11:59:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    });
    await users.upsertMailingListSubscription({
      id: "subscription-pending",
      email: "pending@ondraft.test",
      userId: "user-pending",
      status: "pending",
      consentSource: "registration",
      consentTextVersion: "registration-v1",
      consentedAt: "2026-05-19T12:00:00.000Z",
      unsubscribedAt: null,
      createdAt: "2026-05-19T11:59:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    });
    await users.upsertMailingListSubscription({
      id: "subscription-unsubscribed",
      email: "unsubscribed@ondraft.test",
      userId: "user-unsubscribed",
      status: "unsubscribed",
      consentSource: "registration",
      consentTextVersion: "registration-v1",
      consentedAt: "2026-05-19T12:00:00.000Z",
      unsubscribedAt: "2026-05-19T12:30:00.000Z",
      createdAt: "2026-05-19T11:59:00.000Z",
      updatedAt: "2026-05-19T12:30:00.000Z",
    });

    const result = await service.exportSubscribedMailingListCsv();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('"email","status","consentSource","consentTextVersion","consentedAt","createdAt","updatedAt"');
      expect(result.value).toContain('"subscribed@ondraft.test","subscribed","registration","registration-v1"');
      expect(result.value).toContain('"2026-05-19T12:00:00.000Z"');
      expect(result.value).not.toContain("pending@ondraft.test");
      expect(result.value).not.toContain("unsubscribed@ondraft.test");
    }
  });
});
