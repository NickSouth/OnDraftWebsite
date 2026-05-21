import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";

describe("InMemoryUserRepository", () => {
  it("stores only hashed email verification tokens", async () => {
    const repository = CreateInMemoryUserRepository();
    const tokenHash = "sha256:verification-token-hash";

    const created = await repository.addEmailVerificationToken({
      id: "verification-token-1",
      userId: "user-ryan",
      tokenHash,
      expiresAt: "2026-05-20T12:00:00.000Z",
      createdAt: "2026-05-19T12:00:00.000Z",
    });
    const found = await repository.findEmailVerificationTokenByHash(tokenHash);

    expect(created.ok).toBe(true);
    expect(found.ok).toBe(true);
    if (found.ok) {
      expect(found.value?.tokenHash).toBe(tokenHash);
      expect(found.value).not.toHaveProperty("token");
    }
  });

  it("upserts mailing list consent by email", async () => {
    const repository = CreateInMemoryUserRepository();

    await repository.upsertMailingListSubscription({
      id: "subscription-1",
      email: "reader@ondraft.test",
      userId: null,
      status: "pending",
      consentSource: "registration",
      consentTextVersion: "2026-05-19",
      consentedAt: null,
      unsubscribedAt: null,
      createdAt: "2026-05-19T12:00:00.000Z",
      updatedAt: "2026-05-19T12:00:00.000Z",
    });

    const updated = await repository.upsertMailingListSubscription({
      id: "subscription-2",
      email: "reader@ondraft.test",
      userId: "user-support",
      status: "subscribed",
      consentSource: "registration",
      consentTextVersion: "2026-05-19",
      consentedAt: "2026-05-19T12:05:00.000Z",
      unsubscribedAt: null,
      createdAt: "2026-05-19T12:05:00.000Z",
      updatedAt: "2026-05-19T12:05:00.000Z",
    });
    const found = await repository.findMailingListSubscriptionByEmail("reader@ondraft.test");

    expect(updated.ok).toBe(true);
    expect(found.ok).toBe(true);
    if (found.ok) {
      expect(found.value?.id).toBe("subscription-1");
      expect(found.value?.userId).toBe("user-support");
      expect(found.value?.status).toBe("subscribed");
      expect(found.value?.consentedAt).toBe("2026-05-19T12:05:00.000Z");
    }
  });

  it("stores and clears user bans", async () => {
    const repository = CreateInMemoryUserRepository();

    const banned = await repository.banUser({
      userId: "user-support",
      message: "Take a breather.",
      bannedAt: "2026-05-20T12:00:00.000Z",
      expiresAt: "2026-05-21T12:00:00.000Z",
      bannedByUserId: "user-ryan",
    });
    const foundBanned = await repository.findById("user-support");

    expect(banned.ok).toBe(true);
    expect(foundBanned.ok).toBe(true);
    if (foundBanned.ok) {
      expect(foundBanned.value?.ban).toEqual({
        message: "Take a breather.",
        bannedAt: "2026-05-20T12:00:00.000Z",
        expiresAt: "2026-05-21T12:00:00.000Z",
        bannedByUserId: "user-ryan",
      });
    }

    const unbanned = await repository.unbanUser("user-support");
    const foundUnbanned = await repository.findById("user-support");

    expect(unbanned.ok).toBe(true);
    expect(foundUnbanned.ok).toBe(true);
    if (foundUnbanned.ok) {
      expect(foundUnbanned.value?.ban).toBeNull();
    }
  });

  it("returns copied user ban records from read methods", async () => {
    const repository = CreateInMemoryUserRepository();

    await repository.banUser({
      userId: "user-support",
      message: "Initial message.",
      bannedAt: "2026-05-20T12:00:00.000Z",
      expiresAt: null,
      bannedByUserId: "user-ryan",
    });

    const found = await repository.findById("user-support");
    expect(found.ok).toBe(true);
    if (found.ok && found.value?.ban) {
      found.value.ban.message = "Mutated outside repository.";
    }

    const reread = await repository.findById("user-support");
    expect(reread.ok).toBe(true);
    if (reread.ok) {
      expect(reread.value?.ban?.message).toBe("Initial message.");
    }
  });
});
