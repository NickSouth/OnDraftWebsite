import { CreateInMemoryAnalyticsRepository } from "../../src/repository/InMemoryAnalyticsRepository";
import type { PageViewQuery, PageViewRecord } from "../../src/repository/AnalyticsRepository";
import type { Result } from "../../src/lib/result";

function pageView(overrides: Partial<PageViewRecord> = {}): PageViewRecord {
  return {
    id: overrides.id ?? `view-${Math.random().toString(36).slice(2)}`,
    path: "/articles",
    occurredAt: new Date("2026-07-01T12:00:00.000Z"),
    browserId: "browser-a",
    referrerHost: null,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    deviceType: "desktop",
    authenticated: false,
    isAdmin: false,
    isBot: false,
    ...overrides,
  };
}

function query(overrides: Partial<PageViewQuery> = {}): PageViewQuery {
  return {
    startAt: null,
    endAt: new Date("2026-07-02T00:00:00.000Z"),
    pathPrefix: null,
    excludeAdmin: true,
    excludeBots: true,
    ...overrides,
  };
}

async function unwrap<T, E>(promise: Promise<Result<T, E>>): Promise<T> {
  const result = await promise;
  if (result.ok === false) {
    throw new Error("Expected Ok result");
  }
  return result.value;
}

describe("InMemoryAnalyticsRepository", () => {
  it("round-trips inserted page views as slim rows ordered ascending by occurredAt", async () => {
    const repository = CreateInMemoryAnalyticsRepository();
    await repository.insertPageView(pageView({ id: "late", occurredAt: new Date("2026-07-01T12:30:00.000Z"), path: "/videos" }));
    await repository.insertPageView(pageView({ id: "early", occurredAt: new Date("2026-07-01T12:00:00.000Z") }));

    const rows = await unwrap(repository.getPageViews(query()));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      path: "/articles",
      occurredAt: new Date("2026-07-01T12:00:00.000Z"),
      browserId: "browser-a",
      deviceType: "desktop",
      referrerHost: null,
    });
    expect(rows[1].path).toBe("/videos");
    expect(rows[0].occurredAt.getTime()).toBeLessThan(rows[1].occurredAt.getTime());
  });

  it("filters by the time window with inclusive bounds and startAt null meaning unbounded", async () => {
    const repository = CreateInMemoryAnalyticsRepository();
    await repository.insertPageView(pageView({ occurredAt: new Date("2026-06-01T00:00:00.000Z") }));
    await repository.insertPageView(pageView({ occurredAt: new Date("2026-07-01T00:00:00.000Z") }));
    await repository.insertPageView(pageView({ occurredAt: new Date("2026-07-03T00:00:00.000Z") }));

    const all = await unwrap(repository.getPageViews(query({ endAt: new Date("2026-07-03T00:00:00.000Z") })));
    expect(all).toHaveLength(3);

    const windowed = await unwrap(repository.getPageViews(query({
      startAt: new Date("2026-07-01T00:00:00.000Z"),
      endAt: new Date("2026-07-02T00:00:00.000Z"),
    })));
    expect(windowed).toHaveLength(1);
    expect(windowed[0].occurredAt).toEqual(new Date("2026-07-01T00:00:00.000Z"));
  });

  it("applies the path-prefix semantics for sections, home, and null", async () => {
    const repository = CreateInMemoryAnalyticsRepository();
    await repository.insertPageView(pageView({ path: "/articles" }));
    await repository.insertPageView(pageView({ path: "/articles/a1" }));
    await repository.insertPageView(pageView({ path: "/articlesX" }));
    await repository.insertPageView(pageView({ path: "/" }));

    const articles = await unwrap(repository.getPageViews(query({ pathPrefix: "/articles" })));
    expect(articles.map((row) => row.path).sort()).toEqual(["/articles", "/articles/a1"]);

    const home = await unwrap(repository.getPageViews(query({ pathPrefix: "/" })));
    expect(home.map((row) => row.path)).toEqual(["/"]);

    const everything = await unwrap(repository.getPageViews(query({ pathPrefix: null })));
    expect(everything).toHaveLength(4);
  });

  it("honors excludeAdmin and excludeBots flags", async () => {
    const repository = CreateInMemoryAnalyticsRepository();
    await repository.insertPageView(pageView({ id: "plain" }));
    await repository.insertPageView(pageView({ id: "admin", isAdmin: true, browserId: "browser-admin" }));
    await repository.insertPageView(pageView({ id: "bot", isBot: true, browserId: "browser-bot" }));

    const filtered = await unwrap(repository.getPageViews(query()));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].browserId).toBe("browser-a");

    const withAdmins = await unwrap(repository.getPageViews(query({ excludeAdmin: false })));
    expect(withAdmins).toHaveLength(2);

    const withBots = await unwrap(repository.getPageViews(query({ excludeBots: false })));
    expect(withBots).toHaveLength(2);

    const unfiltered = await unwrap(repository.getPageViews(query({ excludeAdmin: false, excludeBots: false })));
    expect(unfiltered).toHaveLength(3);
  });

  it("returns copies that do not expose internal state to mutation", async () => {
    const repository = CreateInMemoryAnalyticsRepository();
    const inserted = pageView({ occurredAt: new Date("2026-07-01T12:00:00.000Z") });
    await repository.insertPageView(inserted);
    inserted.path = "/mutated-after-insert";

    const first = await unwrap(repository.getPageViews(query()));
    expect(first[0].path).toBe("/articles");

    first[0].path = "/mutated-after-read";
    first[0].occurredAt.setUTCFullYear(1999);

    const second = await unwrap(repository.getPageViews(query()));
    expect(second[0].path).toBe("/articles");
    expect(second[0].occurredAt).toEqual(new Date("2026-07-01T12:00:00.000Z"));
  });
});
