import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type AuthError } from "./errors";
import type {
  BanUserInput,
  CreateEmailVerificationTokenInput,
  IUserRepository,
  UpsertMailingListSubscriptionInput,
} from "./UserRepository";
import type {
  Bookmark,
  IEmailVerificationTokenRecord,
  IMailingListSubscriptionRecord,
  IUserRecord,
  UserPreferences,
} from "./User";

export const DEMO_USERS: IUserRecord[] = [
  {
    id: "user-support",
    email: "support@ondraftfootball.com",
    emailVerifiedAt: "2026-05-19T00:00:00.000Z",
    displayName: "OnDraft Support",
    password: "password123",
    role: "admin",
    ban: null,
    createdAt: "2026-05-19T00:00:00.000Z",
    preferences: {theme: "light", fontSize: "small", bookmarks: []},
  },
  {
    id: "user-ryan",
    email: "ryan@ondraftfootball.com",
    emailVerifiedAt: "2026-05-19T00:00:00.000Z",
    displayName: "Ryan McWalter",
    password: "password123",
    role: "admin",
    ban: null,
    createdAt: "2026-05-19T00:00:00.000Z",
    preferences: {theme: "light", fontSize: "small", bookmarks: []},
  },
  {
    id: "user-aleks",
    email: "aleks@ondraftfootball.com",
    emailVerifiedAt: "2026-05-19T00:00:00.000Z",
    displayName: "Aleks OnDraft",
    password: "password123",
    role: "admin",
    ban: null,
    createdAt: "2026-05-19T00:00:00.000Z",
    preferences: {theme: "light", fontSize: "small", bookmarks: []},
  },
];

class InMemoryUserRepository implements IUserRepository {
  constructor(
    private readonly users: IUserRecord[],
    private readonly emailVerificationTokens: IEmailVerificationTokenRecord[] = [],
    private readonly mailingListSubscriptions: IMailingListSubscriptionRecord[] = [],
  ) {}

  private findUser(userId: string): IUserRecord | null {
    return this.users.find((user) => user.id === userId) ?? null;
  }

  private cloneUser(user: IUserRecord): IUserRecord {
    return {
      ...user,
      ban: user.ban ? { ...user.ban } : null,
      preferences: {
        ...user.preferences,
        bookmarks: [...user.preferences.bookmarks],
      },
    };
  }

  async add(user: IUserRecord): Promise<Result<IUserRecord, AuthError>> {
    try {
      this.users.push(user);
      return Ok(this.cloneUser(user));
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the user."));
    }
  }

  async listUsers(): Promise<Result<IUserRecord[], AuthError>> {
    try {
      return Ok(this.users.map((user) => this.cloneUser(user)));
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the users."));
    }
  }

  async findById(userId: string): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      const user = this.findUser(userId);
      return Ok(user ? this.cloneUser(user) : null);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the user."));
    }
  }

  async findByEmail(email: string): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      const match = this.users.find((user) => user.email === email) ?? null;
      return Ok(match ? this.cloneUser(match) : null);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the users."));
    }
  }

  async banUser(input: BanUserInput): Promise<Result<IUserRecord, AuthError>> {
    try {
      const user = this.findUser(input.userId);
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      user.ban = {
        message: input.message,
        bannedAt: input.bannedAt,
        expiresAt: input.expiresAt,
        bannedByUserId: input.bannedByUserId,
      };
      return Ok(this.cloneUser(user));
    } catch {
      return Err(UnexpectedDependencyError("Unable to ban the user."));
    }
  }

  async unbanUser(userId: string): Promise<Result<IUserRecord, AuthError>> {
    try {
      const user = this.findUser(userId);
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      user.ban = null;
      return Ok(this.cloneUser(user));
    } catch {
      return Err(UnexpectedDependencyError("Unable to unban the user."));
    }
  }

  async getPreferences(userId: string): Promise<Result<UserPreferences, AuthError>> {
    try {
      const user = this.findUser(userId);
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      return Ok({
        ...user.preferences,
        bookmarks: [...user.preferences.bookmarks],
      });
    } catch {
      return Err(UnexpectedDependencyError("Unable to retrieve user preferences."));
    }
  }

  async setEmailVerified(userId: string, verifiedAt: string): Promise<Result<IUserRecord, AuthError>> {
    try {
      const user = this.findUser(userId);
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      user.emailVerifiedAt = verifiedAt;
      return Ok(this.cloneUser(user));
    } catch {
      return Err(UnexpectedDependencyError("Unable to verify the user email."));
    }
  }

  async addEmailVerificationToken(
    token: CreateEmailVerificationTokenInput,
  ): Promise<Result<IEmailVerificationTokenRecord, AuthError>> {
    try {
      const user = this.findUser(token.userId);
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }

      const existing = this.emailVerificationTokens.find((candidate) => candidate.tokenHash === token.tokenHash);
      if (existing) {
        return Err(UnexpectedDependencyError("Email verification token already exists."));
      }

      const created: IEmailVerificationTokenRecord = {
        ...token,
        usedAt: null,
      };
      this.emailVerificationTokens.push(created);
      return Ok(created);
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the email verification token."));
    }
  }

  async findEmailVerificationTokenByHash(
    tokenHash: string,
  ): Promise<Result<IEmailVerificationTokenRecord | null, AuthError>> {
    try {
      const match = this.emailVerificationTokens.find((token) => token.tokenHash === tokenHash) ?? null;
      return Ok(match);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the email verification token."));
    }
  }

  async markEmailVerificationTokenUsed(
    tokenId: string,
    usedAt: string,
  ): Promise<Result<IEmailVerificationTokenRecord, AuthError>> {
    try {
      const token = this.emailVerificationTokens.find((candidate) => candidate.id === tokenId) ?? null;
      if (!token) {
        return Err(UnexpectedDependencyError("Email verification token not found."));
      }
      token.usedAt = usedAt;
      return Ok(token);
    } catch {
      return Err(UnexpectedDependencyError("Unable to update the email verification token."));
    }
  }

  async markUnusedEmailVerificationTokensUsedForUser(
    userId: string,
    usedAt: string,
  ): Promise<Result<void, AuthError>> {
    try {
      for (const token of this.emailVerificationTokens) {
        if (token.userId === userId && !token.usedAt) {
          token.usedAt = usedAt;
        }
      }
      return Ok(undefined);
    } catch {
      return Err(UnexpectedDependencyError("Unable to update the email verification tokens."));
    }
  }

  async upsertMailingListSubscription(
    subscription: UpsertMailingListSubscriptionInput,
  ): Promise<Result<IMailingListSubscriptionRecord, AuthError>> {
    try {
      const existing = this.mailingListSubscriptions.find(
        (candidate) => candidate.email === subscription.email,
      );

      if (existing) {
        existing.userId = subscription.userId;
        existing.status = subscription.status;
        existing.consentSource = subscription.consentSource;
        existing.consentTextVersion = subscription.consentTextVersion;
        existing.consentedAt = subscription.consentedAt;
        existing.unsubscribedAt = subscription.unsubscribedAt;
        existing.updatedAt = subscription.updatedAt;
        return Ok(existing);
      }

      const created: IMailingListSubscriptionRecord = { ...subscription };
      this.mailingListSubscriptions.push(created);
      return Ok(created);
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the mailing list subscription."));
    }
  }

  async findMailingListSubscriptionByEmail(
    email: string,
  ): Promise<Result<IMailingListSubscriptionRecord | null, AuthError>> {
    try {
      const match = this.mailingListSubscriptions.find((subscription) => subscription.email === email) ?? null;
      return Ok(match);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the mailing list subscription."));
    }
  }

  async findMailingListSubscriptionById(
    id: string,
  ): Promise<Result<IMailingListSubscriptionRecord | null, AuthError>> {
    try {
      const match = this.mailingListSubscriptions.find((subscription) => subscription.id === id) ?? null;
      return Ok(match);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the mailing list subscription."));
    }
  }

  async findMailingListSubscriptionByUserId(
    userId: string,
  ): Promise<Result<IMailingListSubscriptionRecord | null, AuthError>> {
    try {
      const match = this.mailingListSubscriptions.find((subscription) => subscription.userId === userId) ?? null;
      return Ok(match);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the mailing list subscription."));
    }
  }

  async listMailingListSubscriptionsByStatus(
    status: IMailingListSubscriptionRecord["status"],
  ): Promise<Result<IMailingListSubscriptionRecord[], AuthError>> {
    try {
      return Ok(this.mailingListSubscriptions
        .filter((subscription) => subscription.status === status)
        .map((subscription) => ({ ...subscription })));
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the mailing list subscriptions."));
    }
  }

  async bookmarkArticle(userId: string, articleId: string): Promise<Result<void, AuthError>> {
    try {
      const user = this.findUser(userId);
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      if (!user.preferences.bookmarks.some((b) => b.type === "article" && b.articleId === articleId)) {
        user.preferences.bookmarks.push({ type: "article", articleId });
      }
      return Ok(undefined);
    }
    catch {
      return Err(UnexpectedDependencyError("Unable to bookmark the article."));
    }
  }

  async bookmarkForumPost(userId: string, forumPostId: string): Promise<Result<void, AuthError>> {
    try {
      const user = this.findUser(userId);
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      if (!user.preferences.bookmarks.some((b) => b.type === "forumPost" && b.forumPostId === forumPostId)) {
        user.preferences.bookmarks.push({ type: "forumPost", forumPostId });
      }
      return Ok(undefined);
    }
    catch {
      return Err(UnexpectedDependencyError("Unable to bookmark the forum post."));
    }
  }

  async removeBookmark(userId: string, bookmark: Bookmark): Promise<Result<void, AuthError>> {
    try {
      const user = this.findUser(userId);
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      user.preferences.bookmarks = user.preferences.bookmarks.filter((existing) => {
        if (bookmark.type === "article") {
          return !(existing.type === "article" && existing.articleId === bookmark.articleId);
        }
        return !(existing.type === "forumPost" && existing.forumPostId === bookmark.forumPostId);
      });
      return Ok(undefined);
    }
    catch {
      return Err(UnexpectedDependencyError("Unable to remove the bookmark."));
    }
  }

  async getBookmarks(userId: string): Promise<Result<Bookmark[], AuthError>> {
    try {
      const user = this.findUser(userId);
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      return Ok([...user.preferences.bookmarks]);
    }    catch {
      return Err(UnexpectedDependencyError("Unable to retrieve bookmarks."));
    }
  }
}

export function CreateInMemoryUserRepository(): IUserRepository {
  return new InMemoryUserRepository(DEMO_USERS.map((user) => ({
    ...user,
    preferences: {
      ...user.preferences,
      bookmarks: [...user.preferences.bookmarks],
    },
  })));
}
