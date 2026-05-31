import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IEmailConfig } from "../config/AppConfig";
import type { IEmailService } from "../email/EmailService";
import { Err, Ok, type Result } from "../lib/result";
import {
  InvalidCredentials,
  UnexpectedDependencyError,
  UserAlreadyExists,
  ValidationError,
  type AuthError,
} from "./errors";
import {
  toAuthenticatedUser,
  type IAuthenticatedUser,
  type IMailingListSubscriptionRecord,
  type IUserBanRecord,
  type MailingListSubscriptionStatus,
} from "./User";
import type { IUserRepository } from "./UserRepository";
import { hashPassword, verifyPassword } from "./PasswordHasher";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
  confirmPassword: string;
  mailingListConsent?: boolean;
}

export interface VerifyEmailInput {
  token: string;
}

export interface RequestEmailVerificationInput {
  email: string;
}

export interface RequestPasswordResetInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface CreateMailingListUnsubscribeUrlInput {
  email: string;
}

export interface UnsubscribeMailingListInput {
  token: string;
}

export interface AccountSettings {
  mailingListStatus: MailingListSubscriptionStatus | "none";
}

export interface AccountSettingsInput {
  userId: string;
}

export interface DeleteAccountInput {
  userId: string;
}

export interface UpdateMailingListPreferenceInput {
  userId: string;
  subscribe: boolean;
}

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export type BanDuration = "1-day" | "1-month" | "1-year" | "permanent";

export interface BanUserInput {
  userId: string;
  message: string;
  duration: BanDuration;
  bannedByUserId: string;
  now?: Date;
}

export interface UnbanUserInput {
  userId: string;
}

export interface GetActiveUserBanInput {
  userId: string;
  now?: Date;
}

export interface AdminUserListItem {
  id: string;
  displayName: string;
  email: string;
  role: string;
  emailVerifiedAt: string | null;
  mailingListStatus: string;
  ban: IUserBanRecord | null;
  activeBan: IUserBanRecord | null;
  registeredAt: string;
}

export interface IAuthService {
  authenticate(input: LoginInput): Promise<Result<IAuthenticatedUser, AuthError>>;
  register(input: RegisterInput): Promise<Result<IAuthenticatedUser, AuthError>>;
  verifyEmail(input: VerifyEmailInput): Promise<Result<IAuthenticatedUser, AuthError>>;
  requestEmailVerification(input: RequestEmailVerificationInput): Promise<Result<void, AuthError>>;
  requestPasswordReset(input: RequestPasswordResetInput): Promise<Result<void, AuthError>>;
  resetPassword(input: ResetPasswordInput): Promise<Result<void, AuthError>>;
  getAccountSettings(input: AccountSettingsInput): Promise<Result<AccountSettings, AuthError>>;
  updateMailingListPreference(
    input: UpdateMailingListPreferenceInput,
  ): Promise<Result<AccountSettings, AuthError>>;
  deleteAccount(input: DeleteAccountInput): Promise<Result<void, AuthError>>;
  changePassword(input: ChangePasswordInput): Promise<Result<void, AuthError>>;
  createMailingListUnsubscribeUrl(input: CreateMailingListUnsubscribeUrlInput): Promise<Result<string | null, AuthError>>;
  unsubscribeMailingList(input: UnsubscribeMailingListInput): Promise<Result<void, AuthError>>;
  exportSubscribedMailingListCsv(): Promise<Result<string, AuthError>>;
  listAdminUsers(): Promise<Result<AdminUserListItem[], AuthError>>;
  banUser(input: BanUserInput): Promise<Result<IAuthenticatedUser, AuthError>>;
  unbanUser(input: UnbanUserInput): Promise<Result<IAuthenticatedUser, AuthError>>;
  getActiveUserBan(input: GetActiveUserBanInput): Promise<Result<IUserBanRecord | null, AuthError>>;
}

const EMAIL_VERIFICATION_FAILED_MESSAGE = "We could not verify that email link. It may be expired or already used.";
const MAILING_LIST_UNSUBSCRIBE_FAILED_MESSAGE = "We could not process that unsubscribe link.";
const BAN_DURATION_MS = 24 * 60 * 60 * 1000;

class NullEmailService implements IEmailService {
  async sendEmailVerificationEmail(): Promise<void> {
    return Promise.resolve();
  }

  async sendPasswordResetEmail(): Promise<void> {
    return Promise.resolve();
  }
}

class AuthService implements IAuthService {
  constructor(
    private readonly users: IUserRepository,
    private readonly email: IEmailService = new NullEmailService(),
    private readonly emailConfig: IEmailConfig = {
      provider: "logging",
      from: null,
      appBaseUrl: "http://localhost:3000",
      resendApiKey: null,
      verificationTokenTtlHours: 24,
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "ondraft-local-mailing-list-unsubscribe-secret",
    },
  ) {}

  async authenticate(input: LoginInput): Promise<Result<IAuthenticatedUser, AuthError>> {
    const email = input.email.trim().toLowerCase();
    const password = input.password;

    if (!email) {
      return Err(ValidationError("Email is required."));
    }

    if (!email.includes("@")) {
      return Err(ValidationError("Email must look like an email address."));
    }

    if (!password.trim()) {
      return Err(ValidationError("Password is required."));
    }

    const userResult = await this.users.findByEmail(email);
    if (userResult.ok === false) {
      return Err(UnexpectedDependencyError(userResult.value.message));
    }

    if (!userResult.value || !(await verifyPassword(password, userResult.value.password))) {
      return Err(InvalidCredentials("Invalid email or password."));
    }

    return Ok(toAuthenticatedUser(userResult.value));
  }

  private async sendVerificationEmail(
    user: { id: string; email: string },
    options: { invalidateExistingTokens?: boolean } = {},
  ): Promise<Result<void, AuthError>> {
    const now = new Date();
    if (options.invalidateExistingTokens) {
      const invalidated = await this.users.markUnusedEmailVerificationTokensUsedForUser(
        user.id,
        now.toISOString(),
      );
      if (invalidated.ok === false) {
        return Err(UnexpectedDependencyError(invalidated.value.message));
      }
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(
      now.getTime() + this.emailConfig.verificationTokenTtlHours * 60 * 60 * 1000,
    );
    const tokenResult = await this.users.addEmailVerificationToken({
      id: randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    });

    if (tokenResult.ok === false) {
      return Err(UnexpectedDependencyError(tokenResult.value.message));
    }

    const verificationUrl = new URL("/verify-email", this.emailConfig.appBaseUrl);
    verificationUrl.searchParams.set("token", rawToken);
    try {
      await this.email.sendEmailVerificationEmail({
        to: user.email,
        verificationUrl: verificationUrl.toString(),
      });
    } catch {
      return Err(UnexpectedDependencyError("Unable to send the email verification message."));
    }

    return Ok(undefined);
  }

  async register(input: RegisterInput): Promise<Result<IAuthenticatedUser, AuthError>> {
    const displayName = input.displayName.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    const confirmPassword = input.confirmPassword;

    if (!displayName) {
      return Err(ValidationError("Display name is required."));
    }

    if (!email) {
      return Err(ValidationError("Email is required."));
    }

    if (!email.includes("@")) {
      return Err(ValidationError("Email must look like an email address."));
    }

    if (password.trim().length < 8) {
      return Err(ValidationError("Password must be at least 8 characters."));
    }

    if (!confirmPassword.trim()) {
      return Err(ValidationError("Please confirm your password."));
    }

    if (password !== confirmPassword) {
      return Err(ValidationError("Passwords must match."));
    }

    const existing = await this.users.findByEmail(email);
    if (existing.ok === false) {
      return Err(UnexpectedDependencyError(existing.value.message));
    }

    if (existing.value) {
      return Err(UserAlreadyExists("An account already exists for that email."));
    }

    const now = new Date();
    const passwordHash = await hashPassword(password);
    const created = await this.users.add({
      id: randomUUID(),
      displayName,
      email,
      emailVerifiedAt: null,
      password: passwordHash,
      role: "user",
      ban: null,
      createdAt: now.toISOString(),
      preferences: {
        theme: "light",
        fontSize: "small",
        bookmarks: [],
      },
    });

    if (created.ok === false) {
      return Err(UnexpectedDependencyError(created.value.message));
    }

    const verificationEmail = await this.sendVerificationEmail(created.value);
    if (verificationEmail.ok === false) {
      return verificationEmail;
    }

    if (input.mailingListConsent === true) {
      const subscriptionResult = await this.users.upsertMailingListSubscription({
        id: randomUUID(),
        email,
        userId: created.value.id,
        status: "pending",
        consentSource: "registration",
        consentTextVersion: "registration-v1",
        consentedAt: now.toISOString(),
        unsubscribedAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });

      if (subscriptionResult.ok === false) {
        return Err(UnexpectedDependencyError(subscriptionResult.value.message));
      }
    }

    return Ok(toAuthenticatedUser(created.value));
  }

  async verifyEmail(input: VerifyEmailInput): Promise<Result<IAuthenticatedUser, AuthError>> {
    const rawToken = input.token.trim();
    if (!rawToken) {
      return Err(ValidationError(EMAIL_VERIFICATION_FAILED_MESSAGE));
    }

    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const tokenResult = await this.users.findEmailVerificationTokenByHash(tokenHash);
    if (tokenResult.ok === false) {
      return Err(UnexpectedDependencyError(tokenResult.value.message));
    }

    const token = tokenResult.value;
    if (!token || token.usedAt || new Date(token.expiresAt).getTime() <= Date.now()) {
      return Err(ValidationError(EMAIL_VERIFICATION_FAILED_MESSAGE));
    }

    const userResult = await this.users.findById(token.userId);
    if (userResult.ok === false) {
      return Err(UnexpectedDependencyError(userResult.value.message));
    }

    let user = userResult.value;
    if (!user) {
      return Err(ValidationError(EMAIL_VERIFICATION_FAILED_MESSAGE));
    }

    const verifiedAt = new Date().toISOString();
    const used = await this.users.markEmailVerificationTokenUsed(token.id, verifiedAt);
    if (used.ok === false) {
      return Err(UnexpectedDependencyError(used.value.message));
    }

    if (!user.emailVerifiedAt) {
      const verified = await this.users.setEmailVerified(user.id, verifiedAt);
      if (verified.ok === false) {
        return Err(UnexpectedDependencyError(verified.value.message));
      }
      user = verified.value;
    }

    const subscriptionResult = await this.users.findMailingListSubscriptionByUserId(user.id);
    if (subscriptionResult.ok === false) {
      return Err(UnexpectedDependencyError(subscriptionResult.value.message));
    }

    const subscription = subscriptionResult.value;
    if (subscription?.status === "pending") {
      const subscribed = await this.users.upsertMailingListSubscription({
        ...subscription,
        status: "subscribed",
        consentedAt: verifiedAt,
        updatedAt: verifiedAt,
      });

      if (subscribed.ok === false) {
        return Err(UnexpectedDependencyError(subscribed.value.message));
      }
    }

    return Ok(toAuthenticatedUser(user));
  }

  async requestEmailVerification(input: RequestEmailVerificationInput): Promise<Result<void, AuthError>> {
    const email = input.email.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return Ok(undefined);
    }

    const userResult = await this.users.findByEmail(email);
    if (userResult.ok === false) {
      return Err(UnexpectedDependencyError(userResult.value.message));
    }

    const user = userResult.value;
    if (!user || user.emailVerifiedAt) {
      return Ok(undefined);
    }

    return this.sendVerificationEmail(user, { invalidateExistingTokens: true });
  }

  async requestPasswordReset(input: RequestPasswordResetInput): Promise<Result<void, AuthError>> {
    const email = input.email.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return Err(ValidationError("Enter the email address for your account."));
    }

    const userResult = await this.users.findByEmail(email);
    if (userResult.ok === false) {
      return Err(UnexpectedDependencyError(userResult.value.message));
    }

    const user = userResult.value;
    if (!user) {
      return Err(ValidationError("No OnDraft account exists for that email address."));
    }

    const now = new Date();
    const usedAt = now.toISOString();
    const invalidated = await this.users.markUnusedPasswordResetTokensUsedForUser(user.id, usedAt);
    if (invalidated.ok === false) {
      return Err(UnexpectedDependencyError(invalidated.value.message));
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(
      now.getTime() + this.emailConfig.passwordResetTokenTtlMinutes * 60 * 1000,
    );
    const tokenResult = await this.users.addPasswordResetToken({
      id: randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
      createdAt: usedAt,
    });

    if (tokenResult.ok === false) {
      return Err(UnexpectedDependencyError(tokenResult.value.message));
    }

    const resetUrl = new URL("/reset-password", this.emailConfig.appBaseUrl);
    resetUrl.searchParams.set("token", rawToken);
    try {
      await this.email.sendPasswordResetEmail({
        to: user.email,
        resetUrl: resetUrl.toString(),
      });
    } catch {
      return Err(UnexpectedDependencyError("Unable to send the password reset message."));
    }

    return Ok(undefined);
  }

  async resetPassword(input: ResetPasswordInput): Promise<Result<void, AuthError>> {
    const rawToken = input.token.trim();
    const password = input.password;
    const confirmPassword = input.confirmPassword;

    if (!rawToken) {
      return Err(ValidationError("We could not reset that password. The link may be expired or already used."));
    }

    if (password.trim().length < 8) {
      return Err(ValidationError("Password must be at least 8 characters."));
    }

    if (!confirmPassword.trim()) {
      return Err(ValidationError("Please confirm your password."));
    }

    if (password !== confirmPassword) {
      return Err(ValidationError("Passwords must match."));
    }

    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const tokenResult = await this.users.findPasswordResetTokenByHash(tokenHash);
    if (tokenResult.ok === false) {
      return Err(UnexpectedDependencyError(tokenResult.value.message));
    }

    const token = tokenResult.value;
    if (!token || token.usedAt || new Date(token.expiresAt).getTime() <= Date.now()) {
      return Err(ValidationError("We could not reset that password. The link may be expired or already used."));
    }

    const userResult = await this.users.findById(token.userId);
    if (userResult.ok === false) {
      return Err(UnexpectedDependencyError(userResult.value.message));
    }
    if (!userResult.value) {
      return Err(ValidationError("We could not reset that password. The link may be expired or already used."));
    }

    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);
    const updatedPassword = await this.users.updatePassword(token.userId, passwordHash);
    if (updatedPassword.ok === false) {
      return Err(UnexpectedDependencyError(updatedPassword.value.message));
    }

    const used = await this.users.markPasswordResetTokenUsed(token.id, now);
    if (used.ok === false) {
      return Err(UnexpectedDependencyError(used.value.message));
    }

    const invalidated = await this.users.markUnusedPasswordResetTokensUsedForUser(token.userId, now);
    if (invalidated.ok === false) {
      return Err(UnexpectedDependencyError(invalidated.value.message));
    }

    return Ok(undefined);
  }

  async getAccountSettings(input: AccountSettingsInput): Promise<Result<AccountSettings, AuthError>> {
    const userId = input.userId.trim();
    if (!userId) {
      return Err(ValidationError("User id is required."));
    }

    const userResult = await this.users.findById(userId);
    if (userResult.ok === false) {
      return Err(UnexpectedDependencyError(userResult.value.message));
    }
    if (!userResult.value) {
      return Err(ValidationError("User not found."));
    }

    const subscriptionResult = await this.users.findMailingListSubscriptionByUserId(userId);
    if (subscriptionResult.ok === false) {
      return Err(UnexpectedDependencyError(subscriptionResult.value.message));
    }

    const mailingListStatus: AccountSettings["mailingListStatus"] = subscriptionResult.value?.status ?? "none";
    return Ok({ mailingListStatus });
  }

  async updateMailingListPreference(
    input: UpdateMailingListPreferenceInput,
  ): Promise<Result<AccountSettings, AuthError>> {
    const userId = input.userId.trim();
    if (!userId) {
      return Err(ValidationError("User id is required."));
    }

    const userResult = await this.users.findById(userId);
    if (userResult.ok === false) {
      return Err(UnexpectedDependencyError(userResult.value.message));
    }

    const user = userResult.value;
    if (!user) {
      return Err(ValidationError("User not found."));
    }

    const existingResult = await this.users.findMailingListSubscriptionByUserId(user.id);
    if (existingResult.ok === false) {
      return Err(UnexpectedDependencyError(existingResult.value.message));
    }

    const now = new Date().toISOString();
    const existing = existingResult.value;
    const status: MailingListSubscriptionStatus = input.subscribe
      ? user.emailVerifiedAt ? "subscribed" : "pending"
      : "unsubscribed";
    const updated = await this.users.upsertMailingListSubscription({
      id: existing?.id ?? randomUUID(),
      email: user.email,
      userId: user.id,
      status,
      consentSource: "settings",
      consentTextVersion: "settings-v1",
      consentedAt: input.subscribe ? now : existing?.consentedAt ?? null,
      unsubscribedAt: input.subscribe ? null : now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    if (updated.ok === false) {
      return Err(UnexpectedDependencyError(updated.value.message));
    }

    return Ok({
      mailingListStatus: updated.value.status,
    });
  }

  async deleteAccount(input: DeleteAccountInput): Promise<Result<void, AuthError>> {
    const userId = input.userId.trim();
    if (!userId) {
      return Err(ValidationError("User id is required."));
    }

    const userResult = await this.users.findById(userId);
    if (userResult.ok === false) {
      return Err(UnexpectedDependencyError(userResult.value.message));
    }
    if (!userResult.value) {
      return Err(ValidationError("User not found."));
    }
    if (userResult.value.role === "admin") {
      return Err(ValidationError("Admin accounts cannot be deleted from account settings."));
    }

    const deleted = await this.users.deleteUser(userId);
    if (deleted.ok === false) {
      return Err(UnexpectedDependencyError(deleted.value.message));
    }

    return Ok(undefined);
  }

  async changePassword(input: ChangePasswordInput): Promise<Result<void, AuthError>> {
    const userId = input.userId.trim();
    const currentPassword = input.currentPassword;
    const newPassword = input.newPassword;
    const confirmPassword = input.confirmPassword;

    if (!userId) {
      return Err(ValidationError("User id is required."));
    }

    if (!currentPassword.trim()) {
      return Err(ValidationError("Current password is required."));
    }

    if (newPassword.trim().length < 8) {
      return Err(ValidationError("Password must be at least 8 characters."));
    }

    if (!confirmPassword.trim()) {
      return Err(ValidationError("Please confirm your password."));
    }

    if (newPassword !== confirmPassword) {
      return Err(ValidationError("Passwords must match."));
    }

    const userResult = await this.users.findById(userId);
    if (userResult.ok === false) {
      return Err(UnexpectedDependencyError(userResult.value.message));
    }

    const user = userResult.value;
    if (!user) {
      return Err(ValidationError("User not found."));
    }

    if (!(await verifyPassword(currentPassword, user.password))) {
      return Err(InvalidCredentials("Current password is incorrect."));
    }

    const passwordHash = await hashPassword(newPassword);
    const updated = await this.users.updatePassword(user.id, passwordHash);
    if (updated.ok === false) {
      return Err(UnexpectedDependencyError(updated.value.message));
    }

    return Ok(undefined);
  }

  async createMailingListUnsubscribeUrl(
    input: CreateMailingListUnsubscribeUrlInput,
  ): Promise<Result<string | null, AuthError>> {
    const email = input.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return Ok(null);
    }

    const subscriptionResult = await this.users.findMailingListSubscriptionByEmail(email);
    if (subscriptionResult.ok === false) {
      return Err(UnexpectedDependencyError(subscriptionResult.value.message));
    }

    const subscription = subscriptionResult.value;
    if (!subscription || subscription.status === "unsubscribed") {
      return Ok(null);
    }

    const token = this.createMailingListUnsubscribeToken(subscription);
    const unsubscribeUrl = new URL("/mailing-list/unsubscribe", this.emailConfig.appBaseUrl);
    unsubscribeUrl.searchParams.set("token", token);
    return Ok(unsubscribeUrl.toString());
  }

  async unsubscribeMailingList(input: UnsubscribeMailingListInput): Promise<Result<void, AuthError>> {
    const tokenPayload = this.parseMailingListUnsubscribeToken(input.token.trim());
    if (!tokenPayload) {
      return Err(ValidationError(MAILING_LIST_UNSUBSCRIBE_FAILED_MESSAGE));
    }

    const subscriptionResult = await this.users.findMailingListSubscriptionById(tokenPayload.subscriptionId);
    if (subscriptionResult.ok === false) {
      return Err(UnexpectedDependencyError(subscriptionResult.value.message));
    }

    const subscription = subscriptionResult.value;
    if (!subscription || subscription.email !== tokenPayload.email) {
      return Err(ValidationError(MAILING_LIST_UNSUBSCRIBE_FAILED_MESSAGE));
    }

    if (subscription.status === "unsubscribed") {
      return Ok(undefined);
    }

    const now = new Date().toISOString();
    const updated = await this.users.upsertMailingListSubscription({
      ...subscription,
      status: "unsubscribed",
      unsubscribedAt: now,
      updatedAt: now,
    });

    if (updated.ok === false) {
      return Err(UnexpectedDependencyError(updated.value.message));
    }

    return Ok(undefined);
  }

  async exportSubscribedMailingListCsv(): Promise<Result<string, AuthError>> {
    const subscriptionsResult = await this.users.listMailingListSubscriptionsByStatus("subscribed");
    if (subscriptionsResult.ok === false) {
      return Err(UnexpectedDependencyError(subscriptionsResult.value.message));
    }

    const header = [
      "email",
      "status",
      "consentSource",
      "consentTextVersion",
      "consentedAt",
      "createdAt",
      "updatedAt",
    ];
    const rows = subscriptionsResult.value
      .map((subscription) => [
        subscription.email,
        subscription.status,
        subscription.consentSource,
        subscription.consentTextVersion,
        subscription.consentedAt ?? "",
        subscription.createdAt,
        subscription.updatedAt,
      ]);

    return Ok([header, ...rows]
      .map((row) => row.map((value) => this.escapeCsvCell(value)).join(","))
      .join("\n"));
  }

  async listAdminUsers(): Promise<Result<AdminUserListItem[], AuthError>> {
    const usersResult = await this.users.listUsers();
    if (usersResult.ok === false) {
      return Err(UnexpectedDependencyError(usersResult.value.message));
    }

    const items: AdminUserListItem[] = [];
    for (const user of usersResult.value) {
      const subscriptionResult = await this.users.findMailingListSubscriptionByEmail(user.email);
      if (subscriptionResult.ok === false) {
        return Err(UnexpectedDependencyError(subscriptionResult.value.message));
      }

      items.push({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        emailVerifiedAt: user.emailVerifiedAt,
        mailingListStatus: subscriptionResult.value?.status ?? "none",
        ban: user.ban ? { ...user.ban } : null,
        activeBan: this.activeBan(user.ban),
        registeredAt: user.createdAt,
      });
    }

    return Ok(items.sort((first, second) => first.email.localeCompare(second.email)));
  }

  async banUser(input: BanUserInput): Promise<Result<IAuthenticatedUser, AuthError>> {
    const userId = input.userId.trim();
    const bannedByUserId = input.bannedByUserId.trim();
    const message = input.message.trim();

    if (!userId) {
      return Err(ValidationError("User id is required."));
    }
    if (!bannedByUserId) {
      return Err(ValidationError("Banning admin id is required."));
    }
    if (!message) {
      return Err(ValidationError("Ban message is required."));
    }
    if (!this.isBanDuration(input.duration)) {
      return Err(ValidationError("Ban duration must be one day, one month, one year, or permanent."));
    }
    if (userId === bannedByUserId) {
      return Err(ValidationError("Admins cannot ban themselves."));
    }

    const targetResult = await this.users.findById(userId);
    if (targetResult.ok === false) {
      return Err(UnexpectedDependencyError(targetResult.value.message));
    }
    const target = targetResult.value;
    if (!target) {
      return Err(ValidationError("User not found."));
    }
    if (target.role === "admin") {
      return Err(ValidationError("Admin users cannot be banned."));
    }

    const adminResult = await this.users.findById(bannedByUserId);
    if (adminResult.ok === false) {
      return Err(UnexpectedDependencyError(adminResult.value.message));
    }
    const admin = adminResult.value;
    if (!admin || admin.role !== "admin") {
      return Err(ValidationError("Only admins can ban users."));
    }

    const now = input.now ?? new Date();
    const banned = await this.users.banUser({
      userId,
      message,
      bannedAt: now.toISOString(),
      expiresAt: this.banExpiresAt(input.duration, now),
      bannedByUserId,
    });
    if (banned.ok === false) {
      return Err(UnexpectedDependencyError(banned.value.message));
    }

    return Ok(toAuthenticatedUser(banned.value));
  }

  async unbanUser(input: UnbanUserInput): Promise<Result<IAuthenticatedUser, AuthError>> {
    const userId = input.userId.trim();
    if (!userId) {
      return Err(ValidationError("User id is required."));
    }

    const unbanned = await this.users.unbanUser(userId);
    if (unbanned.ok === false) {
      return Err(UnexpectedDependencyError(unbanned.value.message));
    }

    return Ok(toAuthenticatedUser(unbanned.value));
  }

  async getActiveUserBan(input: GetActiveUserBanInput): Promise<Result<IUserBanRecord | null, AuthError>> {
    const userId = input.userId.trim();
    if (!userId) {
      return Err(ValidationError("User id is required."));
    }

    const userResult = await this.users.findById(userId);
    if (userResult.ok === false) {
      return Err(UnexpectedDependencyError(userResult.value.message));
    }
    if (!userResult.value) {
      return Err(ValidationError("User not found."));
    }

    return Ok(this.activeBan(userResult.value.ban, input.now));
  }

  private escapeCsvCell(value: string): string {
    const formulaSafeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${formulaSafeValue.replaceAll("\"", "\"\"")}"`;
  }

  private isBanDuration(value: string): value is BanDuration {
    return value === "1-day" || value === "1-month" || value === "1-year" || value === "permanent";
  }

  private banExpiresAt(duration: BanDuration, now: Date): string | null {
    if (duration === "permanent") {
      return null;
    }

    const expiresAt = new Date(now);
    if (duration === "1-day") {
      expiresAt.setTime(now.getTime() + BAN_DURATION_MS);
    } else if (duration === "1-month") {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }
    return expiresAt.toISOString();
  }

  private activeBan(ban: IUserBanRecord | null, now: Date = new Date()): IUserBanRecord | null {
    if (!ban) {
      return null;
    }
    if (ban.expiresAt && new Date(ban.expiresAt).getTime() <= now.getTime()) {
      return null;
    }
    return { ...ban };
  }

  private createMailingListUnsubscribeToken(subscription: IMailingListSubscriptionRecord): string {
    const payload = Buffer.from(JSON.stringify({
      subscriptionId: subscription.id,
      email: subscription.email,
    }), "utf8").toString("base64url");
    return `${payload}.${this.signMailingListPayload(payload)}`;
  }

  private parseMailingListUnsubscribeToken(token: string): { subscriptionId: string; email: string } | null {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) {
      return null;
    }

    if (!this.safeEqual(signature, this.signMailingListPayload(payload))) {
      return null;
    }

    try {
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        subscriptionId?: unknown;
        email?: unknown;
      };
      if (typeof parsed.subscriptionId !== "string" || typeof parsed.email !== "string") {
        return null;
      }
      return {
        subscriptionId: parsed.subscriptionId,
        email: parsed.email,
      };
    } catch {
      return null;
    }
  }

  private signMailingListPayload(payload: string): string {
    return createHmac("sha256", this.emailConfig.mailingListUnsubscribeSecret)
      .update(payload)
      .digest("base64url");
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}

export function CreateAuthService(
  users: IUserRepository,
  email?: IEmailService,
  emailConfig?: IEmailConfig,
): IAuthService {
  return new AuthService(users, email, emailConfig);
}
