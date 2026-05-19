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
        email: "ryanmcwalter@ondraft.test",
        emailVerifiedAt: "2026-03-15T09:00:00.000Z",
        displayName: "Ryan McWalter",
      },
      new Date("2026-03-15T09:30:00.000Z"),
    );

    expect(signedIn.authenticatedUser?.email).toBe("ryanmcwalter@ondraft.test");
    expect(signedIn.authenticatedUser).not.toHaveProperty("password");
  });

  it("requires verified email before admin session privileges", () => {
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
        email: "ryanmcwalter@ondraft.test",
        emailVerifiedAt: null,
        displayName: "Ryan McWalter",
      },
      new Date("2026-03-15T09:30:00.000Z"),
    );

    expect(isAdminSession(unverified)).toBe(false);

    const verified = signInAuthenticatedUser(
      store,
      {
        id: "user-admin",
        email: "ryanmcwalter@ondraft.test",
        emailVerifiedAt: "2026-03-15T09:35:00.000Z",
        displayName: "Ryan McWalter",
      },
      new Date("2026-03-15T09:40:00.000Z"),
    );

    expect(isAdminSession(verified)).toBe(true);
  });
});
