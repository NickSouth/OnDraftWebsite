import session, { type SessionData } from "express-session";
import { getPrismaClient, type OnDraftPrismaClient } from "../prisma/client";
import {
  createInitialOnDraftSession,
  STANDARD_SESSION_MAX_AGE_MS,
  type IOnDraftBrowserSession,
} from "./OnDraftSession";

function parseSessionData(data: string): SessionData | null {
  try {
    const parsed = JSON.parse(data) as SessionData;
    if (typeof parsed.cookie?.expires === "string") {
      parsed.cookie.expires = new Date(parsed.cookie.expires);
    }
    return parsed;
  } catch {
    return null;
  }
}

function sessionExpiry(sessionData: SessionData): Date {
  const cookieExpires = sessionData.cookie?.expires;
  if (cookieExpires) {
    return cookieExpires instanceof Date ? cookieExpires : new Date(cookieExpires);
  }
  return new Date(Date.now() + STANDARD_SESSION_MAX_AGE_MS);
}

function sessionMetadata(sessionData: SessionData): IOnDraftBrowserSession {
  const ondraft = (sessionData as SessionData & { ondraft?: IOnDraftBrowserSession }).ondraft;
  return ondraft ?? createInitialOnDraftSession();
}

export class PrismaSessionStore extends session.Store {
  constructor(private readonly prisma: OnDraftPrismaClient = getPrismaClient()) {
    super();
  }

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    void this.prisma.browserSession.findUnique({ where: { id: sid } })
      .then(async (record) => {
        if (!record || record.expiresAt.getTime() <= Date.now()) {
          if (record) {
            await this.prisma.browserSession.delete({ where: { id: sid } });
          }
          callback(null, null);
          return;
        }

        callback(null, parseSessionData(record.data));
      })
      .catch((error: unknown) => callback(error));
  }

  set(sid: string, sessionData: SessionData, callback?: (err?: unknown) => void): void {
    const ondraft = sessionMetadata(sessionData);
    const authenticatedUser = ondraft.authenticatedUser;
    const expiresAt = sessionExpiry(sessionData);

    void this.prisma.browserSession.upsert({
      where: { id: sid },
      create: {
        id: sid,
        data: JSON.stringify(sessionData),
        browserId: ondraft.browserId,
        browserLabel: ondraft.browserLabel,
        visitCount: ondraft.visitCount,
        authenticatedUserId: authenticatedUser?.userId ?? null,
        signedInAt: authenticatedUser ? new Date(authenticatedUser.signedInAt) : null,
        rememberMe: authenticatedUser?.rememberMe ?? false,
        expiresAt,
        createdAt: new Date(ondraft.createdAt),
        lastSeenAt: new Date(ondraft.lastSeenAt),
      },
      update: {
        data: JSON.stringify(sessionData),
        browserId: ondraft.browserId,
        browserLabel: ondraft.browserLabel,
        visitCount: ondraft.visitCount,
        authenticatedUserId: authenticatedUser?.userId ?? null,
        signedInAt: authenticatedUser ? new Date(authenticatedUser.signedInAt) : null,
        rememberMe: authenticatedUser?.rememberMe ?? false,
        expiresAt,
        lastSeenAt: new Date(ondraft.lastSeenAt),
      },
    })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    void this.prisma.browserSession.deleteMany({ where: { id: sid } })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  touch(sid: string, sessionData: SessionData, callback?: () => void): void {
    this.set(sid, sessionData, callback);
  }
}

export function CreatePrismaSessionStore(prisma?: OnDraftPrismaClient): session.Store {
  return new PrismaSessionStore(prisma);
}
