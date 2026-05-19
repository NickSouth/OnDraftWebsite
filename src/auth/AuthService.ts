import { createHash, randomBytes, randomUUID } from "node:crypto";
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
import { toAuthenticatedUser, type IAuthenticatedUser } from "./User";
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

export interface IAuthService {
  authenticate(input: LoginInput): Promise<Result<IAuthenticatedUser, AuthError>>;
  register(input: RegisterInput): Promise<Result<IAuthenticatedUser, AuthError>>;
  verifyEmail(input: VerifyEmailInput): Promise<Result<void, AuthError>>;
  requestEmailVerification(input: RequestEmailVerificationInput): Promise<Result<void, AuthError>>;
}

const EMAIL_VERIFICATION_FAILED_MESSAGE = "We could not verify that email link. It may be expired or already used.";

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

  private async sendVerificationEmail(user: { id: string; email: string }): Promise<Result<void, AuthError>> {
    const now = new Date();
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

    const used = await this.users.markEmailVerificationTokenUsed(token.id, verifiedAt);
    if (used.ok === false) {
      return Err(UnexpectedDependencyError(used.value.message));
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

    return this.sendVerificationEmail(user);
  }
}

export function CreateAuthService(
  users: IUserRepository,
  email?: IEmailService,
  emailConfig?: IEmailConfig,
): IAuthService {
  return new AuthService(users, email, emailConfig);
}
