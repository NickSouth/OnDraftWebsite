import {
  createInitialOnDraftSession,
  isAdminSession,
  REMEMBERED_SESSION_MAX_AGE_MS,
  signInAuthenticatedUser,
  STANDARD_SESSION_MAX_AGE_MS,
  touchOnDraftSession,
  type OnDraftSessionStore,
} from "../../src/session/OnDraftSession";

describe("OnDraftSession", () => {
  it("creates and touches browser session state", () => {
    const store = {} as OnDraftSessionStore;

    const touched = touchOnDraftSession(store, new Date("2026-03-15T09:15:00.000Z"));

    expect(touched.browserLabel).toMatch(/^Browser /);
    expect(touched.lastSeenAt).toBe("2026-03-15T09:15:00.000Z");
    expect(touched.authenticatedUser).toBeNull();
  });

  it("refreshes standard session cookies to thirty minutes on activity", () => {
    const store = {
      cookie: { maxAge: 1 },
    } as OnDraftSessionStore;

    touchOnDraftSession(store, new Date("2026-03-15T09:15:00.000Z"));

    expect(store.cookie?.maxAge).toBe(30 * 60 * 1000);
    expect(store.cookie?.maxAge).toBe(STANDARD_SESSION_MAX_AGE_MS);
  });

  it("stores authenticated identity without passwords", () => {
    const store = {
      cookie: { maxAge: 1 },
      ondraft: createInitialOnDraftSession(
        new Date("2026-03-15T09:00:00.000Z"),
        "browser-auth",
      ),
    } as OnDraftSessionStore;

    const signedIn = signInAuthenticatedUser(
      store,
      {
        id: "user-alice",
        email: "ryan@ondraftfootball.com",
        emailVerifiedAt: "2026-03-15T09:00:00.000Z",
        displayName: "Ryan McWalter",
        role: "admin",
        ban: null,
        createdAt: "2026-03-15T09:00:00.000Z",
      },
      new Date("2026-03-15T09:30:00.000Z"),
    );

    expect(signedIn.authenticatedUser?.email).toBe("ryan@ondraftfootball.com");
    expect(signedIn.authenticatedUser).not.toHaveProperty("password");
    expect(store.cookie?.maxAge).toBe(STANDARD_SESSION_MAX_AGE_MS);
  });

  it("keeps remembered sessions on the fourteen-day window when activity refreshes them", () => {
    const store = {
      cookie: { maxAge: 1 },
      ondraft: createInitialOnDraftSession(
        new Date("2026-03-15T09:00:00.000Z"),
        "browser-remembered",
      ),
    } as OnDraftSessionStore;

    signInAuthenticatedUser(
      store,
      {
        id: "user-remembered",
        email: "remembered@ondraftfootball.com",
        emailVerifiedAt: "2026-03-15T09:00:00.000Z",
        displayName: "Remembered Reader",
        role: "user",
        ban: null,
        createdAt: "2026-03-15T09:00:00.000Z",
      },
      true,
      new Date("2026-03-15T09:30:00.000Z"),
    );

    expect(store.cookie?.maxAge).toBe(REMEMBERED_SESSION_MAX_AGE_MS);

    store.cookie!.maxAge = 1;
    touchOnDraftSession(store, new Date("2026-03-15T09:45:00.000Z"));

    expect(store.cookie?.maxAge).toBe(REMEMBERED_SESSION_MAX_AGE_MS);
  });

  it("uses configured admin emails without requiring email verification", () => {
    const store = {
      ondraft: createInitialOnDraftSession(
        new Date("2026-03-15T09:00:00.000Z"),
        "browser-admin",
      ),
    } as OnDraftSessionStore;

    const unverified = signInAuthenticatedUser(
      store,
      {
        id: "user-admin",
        email: "ryan@ondraftfootball.com",
        emailVerifiedAt: null,
        displayName: "Ryan McWalter",
        role: "admin",
        ban: null,
        createdAt: "2026-03-15T09:00:00.000Z",
      },
      new Date("2026-03-15T09:30:00.000Z"),
    );

    expect(isAdminSession(unverified)).toBe(true);

    const verified = signInAuthenticatedUser(
      store,
      {
        id: "user-admin",
        email: "reader@ondraftfootball.com",
        emailVerifiedAt: "2026-03-15T09:35:00.000Z",
        displayName: "Reader",
        role: "user",
        ban: null,
        createdAt: "2026-03-15T09:00:00.000Z",
      },
      new Date("2026-03-15T09:40:00.000Z"),
    );

    expect(isAdminSession(verified)).toBe(false);
  });
});
