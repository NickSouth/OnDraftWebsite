import { Err, Ok, type Result } from "../lib/result";
import { UnexpectedDependencyError, type AuthError } from "./errors";
import type { IUserRepository } from "./UserRepository";
import type { Bookmark, IUserRecord, UserPreferences } from "./User";

export const DEMO_USERS: IUserRecord[] = [
  {
    id: "user-ryan",
    email: "ryanmcwalter@ondraft.test",
    displayName: "Ryan McWalter",
    password: "password123",
    role: "admin",
    preferences: {theme: "light", fontSize: "small", bookmarks: []},
  },
  {
    id: "user-bob",
    email: "bob@ondraft.test",
    displayName: "Bob OnDraft",
    password: "password123",
    role: "user",
    preferences: {theme: "light", fontSize: "small", bookmarks: []},
  },
];

class InMemoryUserRepository implements IUserRepository {
  constructor(private readonly users: IUserRecord[]) {}

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
