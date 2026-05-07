import type { Result } from "../lib/result";
import type { AuthError } from "./errors";
import type { Bookmark, IUserRecord, UserPreferences } from "./User";

export interface IUserRepository {
  add(user: IUserRecord): Promise<Result<IUserRecord, AuthError>>;
  findByEmail(email: string): Promise<Result<IUserRecord | null, AuthError>>;
  getPreferences(userId: string): Promise<Result<UserPreferences, AuthError>>;
  bookmarkArticle(userId: string, articleId: string): Promise<Result<void, AuthError>>;
  bookmarkForumPost(userId: string, forumPostId: string): Promise<Result<void, AuthError>>;
  removeBookmark(userId: string, bookmark: Bookmark): Promise<Result<void, AuthError>>;
  getBookmarks(userId: string): Promise<Result<Bookmark[], AuthError>>;
}
