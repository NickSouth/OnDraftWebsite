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

export interface IAuthService {
  authenticate(input: LoginInput): Promise<Result<IAuthenticatedUser, AuthError>>;
  register(input: RegisterInput): Promise<Result<IAuthenticatedUser, AuthError>>;
}

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
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(
      now.getTime() + this.emailConfig.verificationTokenTtlHours * 60 * 60 * 1000,
    );
    const tokenResult = await this.users.addEmailVerificationToken({
      id: randomUUID(),
      userId: created.value.id,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    });

    if (tokenResult.ok === false) {
      return Err(UnexpectedDependencyError(tokenResult.value.message));
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

    const verificationUrl = new URL("/verify-email", this.emailConfig.appBaseUrl);
    verificationUrl.searchParams.set("token", rawToken);
    try {
      await this.email.sendEmailVerificationEmail({
        to: email,
        verificationUrl: verificationUrl.toString(),
      });
    } catch {
      return Err(UnexpectedDependencyError("Unable to send the email verification message."));
    }

    return Ok(toAuthenticatedUser(created.value));
  }
}

export function CreateAuthService(
  users: IUserRepository,
  email?: IEmailService,
  emailConfig?: IEmailConfig,
): IAuthService {
  return new AuthService(users, email, emailConfig);
}
