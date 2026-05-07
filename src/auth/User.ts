export interface IUserRecord {
  id: string;
  email: string;
  displayName: string;
  password: string;
  role: Role;
  preferences: UserPreferences;
}

export interface IAuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

export function toAuthenticatedUser(user: IUserRecord): IAuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

export type Role = "admin" | "user";

export type Bookmark = 
  | { type: "article"; articleId: string }
  | { type: "forumPost"; forumPostId: string }

export type UserPreferences = {
  theme: "light" | "dark";
  fontSize: "small" | "medium" | "large";
  bookmarks: Bookmark[];
};