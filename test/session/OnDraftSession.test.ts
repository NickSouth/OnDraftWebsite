import {
  createInitialOnDraftSession,
  isAdminSession,
  signInAuthenticatedUser,
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

  it("stores authenticated identity without passwords", () => {
    const store = {
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
