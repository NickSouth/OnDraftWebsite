import { randomUUID } from "node:crypto";
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
}

export interface IAuthService {
  authenticate(input: LoginInput): Promise<Result<IAuthenticatedUser, AuthError>>;
  register(input: RegisterInput): Promise<Result<IAuthenticatedUser, AuthError>>;
}

class AuthService implements IAuthService {
  constructor(private readonly users: IUserRepository) {}

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

    return Ok(toAuthenticatedUser(created.value));
  }
}

export function CreateAuthService(users: IUserRepository): IAuthService {
  return new AuthService(users);
}
