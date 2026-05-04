import { randomUUID } from "node:crypto";
import type { Session, SessionData } from "express-session";
import type { IAuthenticatedUser } from "../auth/User";

export interface IAuthenticatedUserSession {
  userId: string;
  email: string;
  displayName: string;
  signedInAt: string;
}

export interface IWebsiteBrowserSession {
  browserId: string;
  browserLabel: string;
  visitCount: number;
  createdAt: string;
  lastSeenAt: string;
  authenticatedUser: IAuthenticatedUserSession | null;
}

export type WebsiteSessionStore = Session &
  Partial<SessionData> & {
    website?: IWebsiteBrowserSession;
  };

function createBrowserLabel(browserId: string): string {
  return `Browser ${browserId.slice(0, 4).toUpperCase()}`;
}

export function createInitialWebsiteSession(
  now: Date = new Date(),
  browserId: string = randomUUID(),
): IWebsiteBrowserSession {
  const timestamp = now.toISOString();

  return {
    browserId,
    browserLabel: createBrowserLabel(browserId),
    visitCount: 0,
    createdAt: timestamp,
    lastSeenAt: timestamp,
    authenticatedUser: null,
  };
}

function ensureWebsiteSession(
  store: WebsiteSessionStore,
  now: Date = new Date(),
): IWebsiteBrowserSession {
  if (!store.website) {
    store.website = createInitialWebsiteSession(now);
  }

  return store.website;
}

function snapshotSession(session: IWebsiteBrowserSession): IWebsiteBrowserSession {
  return { ...session };
}

export function recordPageView(
  store: WebsiteSessionStore,
  now: Date = new Date(),
): IWebsiteBrowserSession {
  const session = ensureWebsiteSession(store, now);
  session.visitCount += 1;
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

export function touchWebsiteSession(
  store: WebsiteSessionStore,
  now: Date = new Date(),
): IWebsiteBrowserSession {
  const session = ensureWebsiteSession(store, now);
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

export function signInAuthenticatedUser(
  store: WebsiteSessionStore,
  user: IAuthenticatedUser,
  now: Date = new Date(),
): IWebsiteBrowserSession {
  const session = ensureWebsiteSession(store, now);
  session.authenticatedUser = {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    signedInAt: now.toISOString(),
  };
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

export function signOutAuthenticatedUser(
  store: WebsiteSessionStore,
  now: Date = new Date(),
): IWebsiteBrowserSession {
  const session = ensureWebsiteSession(store, now);
  session.authenticatedUser = null;
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

export function getAuthenticatedUser(
  store: WebsiteSessionStore,
  now: Date = new Date(),
): IAuthenticatedUserSession | null {
  return ensureWebsiteSession(store, now).authenticatedUser;
}

export function isAuthenticatedSession(
  store: WebsiteSessionStore,
  now: Date = new Date(),
): boolean {
  return getAuthenticatedUser(store, now) !== null;
}

export function isAdminSession(session: IWebsiteBrowserSession): boolean {
  const email = session.authenticatedUser?.email;
  if (!email) {
    return false;
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "ryanmcwalter@cheekscast.test")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(email.toLowerCase());
}
