export interface IUserRecord {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
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

export interface IEmailVerificationTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export type MailingListSubscriptionStatus = "pending" | "subscribed" | "unsubscribed";

export interface IMailingListSubscriptionRecord {
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

export type Bookmark = 
  | { type: "article"; articleId: string }
  | { type: "forumPost"; forumPostId: string }

export type UserPreferences = {
  theme: "light" | "dark";
  fontSize: "small" | "medium" | "large";
  bookmarks: Bookmark[];
};
