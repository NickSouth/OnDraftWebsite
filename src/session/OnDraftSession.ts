import { randomUUID } from "node:crypto";
import type { Session, SessionData } from "express-session";
import type { IAuthenticatedUser } from "../auth/User";

export interface IAuthenticatedUserSession {
  userId: string;
  email: string;
  emailVerifiedAt: string | null;
  displayName: string;
  role: string;
  createdAt: string;
  signedInAt: string;
}

export interface IOnDraftBrowserSession {
  browserId: string;
  browserLabel: string;
  visitCount: number;
  createdAt: string;
  lastSeenAt: string;
  authenticatedUser: IAuthenticatedUserSession | null;
}

export type OnDraftSessionStore = Session &
  Partial<SessionData> & {
    ondraft?: IOnDraftBrowserSession;
  };

function createBrowserLabel(browserId: string): string {
  return `Browser ${browserId.slice(0, 4).toUpperCase()}`;
}

export function createInitialOnDraftSession(
  now: Date = new Date(),
  browserId: string = randomUUID(),
): IOnDraftBrowserSession {
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

function ensureOnDraftSession(
  store: OnDraftSessionStore,
  now: Date = new Date(),
): IOnDraftBrowserSession {
  if (!store.ondraft) {
    store.ondraft = createInitialOnDraftSession(now);
  }

  return store.ondraft;
}

function snapshotSession(session: IOnDraftBrowserSession): IOnDraftBrowserSession {
  return { ...session };
}

export function recordPageView(
  store: OnDraftSessionStore,
  now: Date = new Date(),
): IOnDraftBrowserSession {
  const session = ensureOnDraftSession(store, now);
  session.visitCount += 1;
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

export function touchOnDraftSession(
  store: OnDraftSessionStore,
  now: Date = new Date(),
): IOnDraftBrowserSession {
  const session = ensureOnDraftSession(store, now);
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

export function signInAuthenticatedUser(
  store: OnDraftSessionStore,
  user: IAuthenticatedUser,
  now: Date = new Date(),
): IOnDraftBrowserSession {
  const session = ensureOnDraftSession(store, now);
  session.authenticatedUser = {
    userId: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    signedInAt: now.toISOString(),
  };
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

export function signOutAuthenticatedUser(
  store: OnDraftSessionStore,
  now: Date = new Date(),
): IOnDraftBrowserSession {
  const session = ensureOnDraftSession(store, now);
  session.authenticatedUser = null;
  session.lastSeenAt = now.toISOString();
  return snapshotSession(session);
}

export function getAuthenticatedUser(
  store: OnDraftSessionStore,
  now: Date = new Date(),
): IAuthenticatedUserSession | null {
  return ensureOnDraftSession(store, now).authenticatedUser;
}

export function isAuthenticatedSession(
  store: OnDraftSessionStore,
  now: Date = new Date(),
): boolean {
  return getAuthenticatedUser(store, now) !== null;
}

export function isAdminSession(session: IOnDraftBrowserSession): boolean {
  const email = session.authenticatedUser?.email;
  if (!email) {
    return false;
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "support@ondraftfootball.com,ryan@ondraftfootball.com,aleks@ondraftfootball.com")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(email.toLowerCase());
}

export function isVerifiedUserSession(session: IOnDraftBrowserSession): boolean {
  return Boolean(session.authenticatedUser?.emailVerifiedAt);
}
