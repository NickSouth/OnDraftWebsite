import type { Result } from "../lib/result";
import type { AuthError } from "./errors";
import type { IUserRecord } from "./User";

export interface IUserRepository {
  add(user: IUserRecord): Promise<Result<IUserRecord, AuthError>>;
  findByEmail(email: string): Promise<Result<IUserRecord | null, AuthError>>;
}
