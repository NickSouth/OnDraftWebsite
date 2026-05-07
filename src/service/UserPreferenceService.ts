import { Err, Ok, Result } from "../lib/result";
import type { AuthError } from "../auth/errors";
import type { Bookmark, UserPreferences } from "../auth/User";
import type { IUserRepository } from "../auth/UserRepository";

export interface IUserPreferenceService {
  getUserPreferences(userId: string): Promise<Result<UserPreferences, UserPreferenceError>>;
  getUserBookmarks(userId: string): Promise<Result<Bookmark[], UserPreferenceError>>;
  toggleBookmark(userId: string, bookmark: Bookmark): Promise<Result<boolean, UserPreferenceError>>;
  isBookmarked(userId: string, bookmark: Bookmark): Promise<Result<boolean, UserPreferenceError>>;
}

export type UserPreferenceError =
  | { name: "UserNotFound"; message: string }
  | { name: "DatabaseError"; message: string }
  | { name: "UnknownUserPreferenceError"; message: string };

const UserNotFound = (message: string): UserPreferenceError => ({ name: "UserNotFound", message });
const DatabaseError = (message: string): UserPreferenceError => ({ name: "DatabaseError", message });
const UnknownUserPreferenceError = (message: string): UserPreferenceError => ({ name: "UnknownUserPreferenceError", message });

function sameBookmark(first: Bookmark, second: Bookmark): boolean {
  if (first.type !== second.type) {
    return false;
  }
  if (first.type === "article" && second.type === "article") {
    return first.articleId === second.articleId;
  }
  if (first.type === "forumPost" && second.type === "forumPost") {
    return first.forumPostId === second.forumPostId;
  }
  return false;
}

class UserPreferenceService implements IUserPreferenceService {
  constructor(private readonly userRepository: IUserRepository) {}

  private mapAuthError(error: AuthError, userId: string): UserPreferenceError {
    if (error.name === "UnexpectedDependencyError" && error.message.toLowerCase().includes("user not found")) {
      return UserNotFound(`User with ID ${userId} not found.`);
    }
    if (error.name === "UnexpectedDependencyError") {
      return DatabaseError(error.message);
    }
    return UnknownUserPreferenceError(error.message);
  }

  async getUserPreferences(userId: string): Promise<Result<UserPreferences, UserPreferenceError>> {
    const result = await this.userRepository.getPreferences(userId);
    if (result.ok === false) {
      return Err(this.mapAuthError(result.value, userId));
    }
    return Ok(result.value);
  }

  async getUserBookmarks(userId: string): Promise<Result<Bookmark[], UserPreferenceError>> {
    const result = await this.userRepository.getBookmarks(userId);
    if (result.ok === false) {
      return Err(this.mapAuthError(result.value, userId));
    }
    return Ok(result.value);
  }

  async isBookmarked(userId: string, bookmark: Bookmark): Promise<Result<boolean, UserPreferenceError>> {
    const bookmarks = await this.getUserBookmarks(userId);
    if (bookmarks.ok === false) {
      return Err(bookmarks.value);
    }
    return Ok(bookmarks.value.some((existing) => sameBookmark(existing, bookmark)));
  }

  async toggleBookmark(userId: string, bookmark: Bookmark): Promise<Result<boolean, UserPreferenceError>> {
    const current = await this.isBookmarked(userId, bookmark);
    if (current.ok === false) {
      return Err(current.value);
    }

    const result = current.value
      ? await this.userRepository.removeBookmark(userId, bookmark)
      : bookmark.type === "article"
        ? await this.userRepository.bookmarkArticle(userId, bookmark.articleId)
        : await this.userRepository.bookmarkForumPost(userId, bookmark.forumPostId);

    if (result.ok === false) {
      return Err(this.mapAuthError(result.value, userId));
    }
    return Ok(!current.value);
  }
}

export function CreateUserPreferenceService(userRepository: IUserRepository): IUserPreferenceService {
  return new UserPreferenceService(userRepository);
}
