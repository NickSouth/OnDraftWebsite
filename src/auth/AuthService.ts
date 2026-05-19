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
import { toAuthenticatedUser, type IAuthenticatedUser, type IMailingListSubscriptionRecord } from "./User";
import type { IUserRepository } from "./UserRepository";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
  mailingListConsent?: boolean;
}

export interface VerifyEmailInput {
  token: string;
}

export interface RequestEmailVerificationInput {
  email: string;
}

export interface CreateMailingListUnsubscribeUrlInput {
  email: string;
}

export interface UnsubscribeMailingListInput {
  token: string;
}

export interface IAuthService {
  authenticate(input: LoginInput): Promise<Result<IAuthenticatedUser, AuthError>>;
  register(input: RegisterInput): Promise<Result<IAuthenticatedUser, AuthError>>;
  verifyEmail(input: VerifyEmailInput): Promise<Result<void, AuthError>>;
  requestEmailVerification(input: RequestEmailVerificationInput): Promise<Result<void, AuthError>>;
  createMailingListUnsubscribeUrl(input: CreateMailingListUnsubscribeUrlInput): Promise<Result<string | null, AuthError>>;
  unsubscribeMailingList(input: UnsubscribeMailingListInput): Promise<Result<void, AuthError>>;
  exportSubscribedMailingListCsv(): Promise<Result<string, AuthError>>;
}

const EMAIL_VERIFICATION_FAILED_MESSAGE = "We could not verify that email link. It may be expired or already used.";
const MAILING_LIST_UNSUBSCRIBE_FAILED_MESSAGE = "We could not process that unsubscribe link.";

class NullEmailService implements IEmailService {
  async sendEmailVerificationEmail(): Promise<void> {
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

    if (!userResult.value || userResult.value.password !== password) {
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

    const existing = await this.users.findByEmail(email);
    if (existing.ok === false) {
      return Err(UnexpectedDependencyError(existing.value.message));
    }

    if (existing.value) {
      return Err(UserAlreadyExists("An account already exists for that email."));
    }

    const created = await this.users.add({
      id: randomUUID(),
      displayName,
      email,
      emailVerifiedAt: null,
      password,
      role: "user",
      preferences: {
        theme: "light",
        fontSize: "small",
        bookmarks: [],
      },
    });

    if (created.ok === false) {
      return Err(UnexpectedDependencyError(created.value.message));
    }

    const now = new Date();
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

  async verifyEmail(input: VerifyEmailInput): Promise<Result<void, AuthError>> {
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

    const user = userResult.value;
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

    return Ok(undefined);
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

  private escapeCsvCell(value: string): string {
    const formulaSafeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${formulaSafeValue.replaceAll("\"", "\"\"")}"`;
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
