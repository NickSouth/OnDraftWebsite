import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type AuthError } from "./errors";
import type { IUserRepository } from "./UserRepository";
import type { IUserRecord } from "./User";

export const DEMO_USERS: IUserRecord[] = [
  {
    id: "user-ryan",
    email: "ryanmcwalter@cheekscast.test",
    displayName: "Ryan McWalter",
    password: "password123",
  },
  {
    id: "user-bob",
    email: "bob@website.test",
    displayName: "Bob Website",
    password: "password123",
  },
];

class InMemoryUserRepository implements IUserRepository {
  constructor(private readonly users: IUserRecord[]) {}

  async add(user: IUserRecord): Promise<Result<IUserRecord, AuthError>> {
    try {
      this.users.push(user);
      return Ok(user);
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the user."));
    }
  }

  async findByEmail(email: string): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      const match = this.users.find((user) => user.email === email) ?? null;
      return Ok(match);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the users."));
    }
  }
}

export function CreateInMemoryUserRepository(): IUserRepository {
  return new InMemoryUserRepository([...DEMO_USERS]);
}
