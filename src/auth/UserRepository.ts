import type { Result } from "../lib/result";
import type { AuthError } from "./errors";
import type {
  Bookmark,
  IEmailVerificationTokenRecord,
  IMailingListSubscriptionRecord,
  IUserRecord,
  MailingListSubscriptionStatus,
  UserPreferences,
} from "./User";

export interface CreateEmailVerificationTokenInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface UpsertMailingListSubscriptionInput {
  id: string;
  email: string;
  userId: string | null;
  status: MailingListSubscriptionStatus;
  consentSource: string;
  consentTextVersion: string;
  consentedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IUserRepository {
  add(user: IUserRecord): Promise<Result<IUserRecord, AuthError>>;
  findById(userId: string): Promise<Result<IUserRecord | null, AuthError>>;
  findByEmail(email: string): Promise<Result<IUserRecord | null, AuthError>>;
  setEmailVerified(userId: string, verifiedAt: string): Promise<Result<IUserRecord, AuthError>>;
  addEmailVerificationToken(
    token: CreateEmailVerificationTokenInput,
  ): Promise<Result<IEmailVerificationTokenRecord, AuthError>>;
  findEmailVerificationTokenByHash(
    tokenHash: string,
  ): Promise<Result<IEmailVerificationTokenRecord | null, AuthError>>;
  markEmailVerificationTokenUsed(
    tokenId: string,
    usedAt: string,
  ): Promise<Result<IEmailVerificationTokenRecord, AuthError>>;
  markUnusedEmailVerificationTokensUsedForUser(
    userId: string,
    usedAt: string,
  ): Promise<Result<void, AuthError>>;
  upsertMailingListSubscription(
    subscription: UpsertMailingListSubscriptionInput,
  ): Promise<Result<IMailingListSubscriptionRecord, AuthError>>;
  findMailingListSubscriptionByEmail(
    email: string,
  ): Promise<Result<IMailingListSubscriptionRecord | null, AuthError>>;
  findMailingListSubscriptionById(
    id: string,
  ): Promise<Result<IMailingListSubscriptionRecord | null, AuthError>>;
  findMailingListSubscriptionByUserId(
    userId: string,
  ): Promise<Result<IMailingListSubscriptionRecord | null, AuthError>>;
  listMailingListSubscriptionsByStatus(
    status: MailingListSubscriptionStatus,
  ): Promise<Result<IMailingListSubscriptionRecord[], AuthError>>;
  getPreferences(userId: string): Promise<Result<UserPreferences, AuthError>>;
  bookmarkArticle(userId: string, articleId: string): Promise<Result<void, AuthError>>;
  bookmarkForumPost(userId: string, forumPostId: string): Promise<Result<void, AuthError>>;
  removeBookmark(userId: string, bookmark: Bookmark): Promise<Result<void, AuthError>>;
  getBookmarks(userId: string): Promise<Result<Bookmark[], AuthError>>;
}
