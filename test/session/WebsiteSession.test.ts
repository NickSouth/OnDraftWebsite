import {
  createInitialWebsiteSession,
  signInAuthenticatedUser,
  touchWebsiteSession,
  type WebsiteSessionStore,
} from "../../src/session/WebsiteSession";

describe("WebsiteSession", () => {
  it("creates and touches browser session state", () => {
    const store = {} as WebsiteSessionStore;

    const touched = touchWebsiteSession(store, new Date("2026-03-15T09:15:00.000Z"));

    expect(touched.browserLabel).toMatch(/^Browser /);
    expect(touched.lastSeenAt).toBe("2026-03-15T09:15:00.000Z");
    expect(touched.authenticatedUser).toBeNull();
  });

  it("stores authenticated identity without passwords", () => {
    const store = {
      website: createInitialWebsiteSession(
        new Date("2026-03-15T09:00:00.000Z"),
        "browser-auth",
      ),
    } as WebsiteSessionStore;

    const signedIn = signInAuthenticatedUser(
      store,
      {
        id: "user-alice",
        email: "alice@website.test",
        displayName: "Alice Website",
      },
      new Date("2026-03-15T09:30:00.000Z"),
    );

    expect(signedIn.authenticatedUser?.email).toBe("alice@website.test");
    expect(signedIn.authenticatedUser).not.toHaveProperty("password");
  });
});
