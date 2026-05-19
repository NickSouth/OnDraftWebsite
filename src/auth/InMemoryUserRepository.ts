import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type AuthError } from "./errors";
import type {
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
    id: "user-ryan",
    email: "ryanmcwalter@ondraft.test",
    emailVerifiedAt: null,
    displayName: "Ryan McWalter",
    password: "password123",
    role: "admin",
    preferences: {theme: "light", fontSize: "small", bookmarks: []},
  },
  {
    id: "user-bob",
    email: "bob@ondraft.test",
    emailVerifiedAt: null,
    displayName: "Bob OnDraft",
    password: "password123",
    role: "user",
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

  async add(user: IUserRecord): Promise<Result<IUserRecord, AuthError>> {
    try {
      this.users.push(user);
      return Ok(user);
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the user."));
    }
  }

  async findById(userId: string): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      return Ok(this.findUser(userId));
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the user."));
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
      return Ok(user);
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
