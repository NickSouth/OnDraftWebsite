import { CreateLocalAnalyticsService } from "../../src/service/LocalAnalyticsService";
import { CreateInMemoryAnalyticsRepository } from "../../src/repository/InMemoryAnalyticsRepository";
import {
  AnalyticsDatabaseError,
  type IAnalyticsRepository,
  type PageViewQuery,
  type PageViewRecord,
  type PageViewRow,
} from "../../src/repository/AnalyticsRepository";
import type { PageViewInput } from "../../src/service/AnalyticsService";
import type { ILoggingService } from "../../src/service/LoggingService";
import { Err, Ok, type Result } from "../../src/lib/result";

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function stubLogger(): ILoggingService & { warn: jest.Mock } {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

class CapturingAnalyticsRepository implements IAnalyticsRepository {
  records: PageViewRecord[] = [];

  async insertPageView(view: PageViewRecord): Promise<Result<void, { name: "DatabaseError"; message: string }>> {
    this.records.push(view);
    return Ok(undefined);
  }

  async getPageViews(_query: PageViewQuery): Promise<Result<PageViewRow[], { name: "DatabaseError"; message: string }>> {
    return Ok([]);
  }
}

class TogglingAnalyticsRepository implements IAnalyticsRepository {
  fail = false;
  private readonly inner = CreateInMemoryAnalyticsRepository();

  insertPageView(view: PageViewRecord) {
    return this.inner.insertPageView(view);
  }

  async getPageViews(query: PageViewQuery): Promise<Result<PageViewRow[], { name: "DatabaseError"; message: string }>> {
    if (this.fail) {
      return Err(AnalyticsDatabaseError("boom"));
    }
    return this.inner.getPageViews(query);
  }
}

function viewInput(overrides: Partial<PageViewInput> = {}): PageViewInput {
  return {
    path: "/articles",
    browserId: "browser-a",
    referrer: null,
    userAgent: DESKTOP_UA,
    host: "ondraftfootball.com",
    authenticated: false,
    isAdmin: false,
    ...overrides,
  };
}

async function unwrap<T, E>(promise: Promise<Result<T, E>>): Promise<T> {
  const result = await promise;
  if (result.ok === false) {
    throw new Error(`Expected Ok result, got ${JSON.stringify(result.value)}`);
  }
  return result.value;
}

const FIXED_NOW = new Date("2026-07-01T12:00:00.000Z");

describe("LocalAnalyticsService", () => {
  describe("recordPageView derivation", () => {
    it("derives device type, bot flags, referrer host, and truncates long user agents", async () => {
      const repository = new CapturingAnalyticsRepository();
      const service = CreateLocalAnalyticsService(repository, stubLogger(), () => FIXED_NOW);

      await service.recordPageView(viewInput({ userAgent: DESKTOP_UA }));
      await service.recordPageView(viewInput({ userAgent: IPHONE_UA }));
      await service.recordPageView(viewInput({ userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)" }));
      await service.recordPageView(viewInput({ userAgent: null }));
      await service.recordPageView(viewInput({ referrer: "https://twitter.com/x" }));
      await service.recordPageView(viewInput({ referrer: "https://ondraftfootball.com/videos" }));
      await service.recordPageView(viewInput({ referrer: "not a url at all" }));
      await service.recordPageView(viewInput({ userAgent: "A".repeat(500) }));

      expect(repository.records[0].deviceType).toBe("desktop");
      expect(repository.records[0].isBot).toBe(false);
      expect(repository.records[0].occurredAt).toEqual(FIXED_NOW);
      expect(repository.records[1].deviceType).toBe("mobile");
      expect(repository.records[2].isBot).toBe(true);
      expect(repository.records[3].isBot).toBe(true);
      expect(repository.records[3].userAgent).toBeNull();
      expect(repository.records[4].referrerHost).toBe("twitter.com");
      expect(repository.records[5].referrerHost).toBeNull();
      expect(repository.records[6].referrerHost).toBeNull();
      expect(repository.records[7].userAgent).toHaveLength(400);
    });
  });

  describe("getSummary metrics", () => {
    async function seededService() {
      const repository = CreateInMemoryAnalyticsRepository();
      const logger = stubLogger();
      const service = CreateLocalAnalyticsService(repository, logger, () => FIXED_NOW);

      // Browser A: two views 10 minutes apart (one visit) plus one 2 hours later (second visit).
      await service.recordPageView(viewInput({ path: "/articles", browserId: "browser-a", occurredAt: new Date("2026-07-01T08:00:00.000Z") }));
      await service.recordPageView(viewInput({ path: "/articles/a1", browserId: "browser-a", occurredAt: new Date("2026-07-01T08:10:00.000Z") }));
      await service.recordPageView(viewInput({ path: "/videos", browserId: "browser-a", occurredAt: new Date("2026-07-01T10:10:00.000Z") }));
      // Browser B: single view (bounce), mobile, external referrer.
      await service.recordPageView(viewInput({
        path: "/articles",
        browserId: "browser-b",
        userAgent: IPHONE_UA,
        referrer: "https://twitter.com/ondraft",
        occurredAt: new Date("2026-07-01T09:00:00.000Z"),
      }));
      // Admin and bot views must be excluded from every aggregate.
      await service.recordPageView(viewInput({ path: "/articles", browserId: "browser-admin", isAdmin: true, occurredAt: new Date("2026-07-01T08:05:00.000Z") }));
      await service.recordPageView(viewInput({ path: "/articles", browserId: "browser-bot", userAgent: "Googlebot/2.1", occurredAt: new Date("2026-07-01T08:06:00.000Z") }));

      return { service, repository, logger };
    }

    it("computes pageviews, visitors, visits, bounce rate, and average visit length with admin and bot views excluded", async () => {
      const { service } = await seededService();
      const summary = await unwrap(service.getSummary("all", "week"));

      expect(summary.configured).toBe(true);
      expect(summary.cacheStatus).toBe("live");
      expect(summary.pageviews).toBe(4);
      expect(summary.visitors).toBe(2);
      expect(summary.visits).toBe(3);
      expect(summary.bounceRate).toBe(67);
      expect(summary.averageVisitLengthSeconds).toBe(200);
      expect(summary.rangeLabel).toBe("Last week");
      expect(summary.message).toBeUndefined();
    });

    it("builds a zero-filled daily series across the week window", async () => {
      const { service } = await seededService();
      const summary = await unwrap(service.getSummary("all", "week"));

      expect(summary.pageviewSeries).toHaveLength(8);
      expect(summary.pageviewSeries[0].timestamp).toBe("2026-06-24T00:00:00.000Z");
      const lastPoint = summary.pageviewSeries[summary.pageviewSeries.length - 1];
      expect(lastPoint.timestamp).toBe("2026-07-01T00:00:00.000Z");
      expect(lastPoint.pageviews).toBe(4);
      expect(lastPoint.sessions).toBe(3);
      summary.pageviewSeries.slice(0, -1).forEach((point) => {
        expect(point.pageviews).toBe(0);
        expect(point.sessions).toBe(0);
      });
    });

    it("uses month buckets for the all-time period", async () => {
      const repository = CreateInMemoryAnalyticsRepository();
      const service = CreateLocalAnalyticsService(repository, stubLogger(), () => FIXED_NOW);
      await service.recordPageView(viewInput({ occurredAt: new Date("2026-05-22T12:00:00.000Z") }));
      await service.recordPageView(viewInput({ occurredAt: new Date("2026-07-01T08:00:00.000Z") }));

      const summary = await unwrap(service.getSummary("all", "all"));

      expect(summary.pageviewSeries.map((point) => point.timestamp)).toEqual([
        "2026-05-01T00:00:00.000Z",
        "2026-06-01T00:00:00.000Z",
        "2026-07-01T00:00:00.000Z",
      ]);
      expect(summary.pageviewSeries.map((point) => point.pageviews)).toEqual([1, 0, 1]);
    });

    it("reports top content, device, and referrer breakdowns by distinct visitors", async () => {
      const { service } = await seededService();
      const summary = await unwrap(service.getSummary("all", "week"));

      expect(summary.topContent[0]).toEqual({ path: "/articles", visitors: 2 });
      expect(summary.topContent).toContainEqual({ path: "/articles/a1", visitors: 1 });
      expect(summary.topContent).toContainEqual({ path: "/videos", visitors: 1 });
      expect(summary.topContent.length).toBeLessThanOrEqual(6);
      expect(summary.deviceBreakdown).toContainEqual({ name: "Desktop", visitors: 1 });
      expect(summary.deviceBreakdown).toContainEqual({ name: "Mobile", visitors: 1 });
      expect(summary.referrerBreakdown).toContainEqual({ name: "Direct", visitors: 1 });
      expect(summary.referrerBreakdown).toContainEqual({ name: "twitter.com", visitors: 1 });
    });

    it("filters categories by path prefix with home matching only the root path", async () => {
      const { service } = await seededService();
      const repository = CreateInMemoryAnalyticsRepository();
      const homeService = CreateLocalAnalyticsService(repository, stubLogger(), () => FIXED_NOW);
      await homeService.recordPageView(viewInput({ path: "/", occurredAt: new Date("2026-07-01T08:00:00.000Z") }));
      await homeService.recordPageView(viewInput({ path: "/articles", occurredAt: new Date("2026-07-01T08:01:00.000Z") }));

      const articles = await unwrap(service.getSummary("articles", "week"));
      expect(articles.pageviews).toBe(3);
      expect(articles.visitors).toBe(2);

      const home = await unwrap(homeService.getSummary("home", "week"));
      expect(home.pageviews).toBe(1);
    });

    it("applies the period window so old views only appear in all time", async () => {
      const repository = CreateInMemoryAnalyticsRepository();
      const service = CreateLocalAnalyticsService(repository, stubLogger(), () => FIXED_NOW);
      await service.recordPageView(viewInput({ occurredAt: new Date("2026-05-22T12:00:00.000Z") }));
      await service.recordPageView(viewInput({ occurredAt: new Date("2026-07-01T08:00:00.000Z") }));

      const month = await unwrap(service.getSummary("all", "month"));
      expect(month.pageviews).toBe(1);

      const allTime = await unwrap(service.getSummary("all", "all"));
      expect(allTime.pageviews).toBe(2);
    });
  });

  describe("caching", () => {
    it("serves cached summaries within the TTL and re-queries after it expires", async () => {
      let fixedNow = new Date("2026-07-01T12:00:00.000Z");
      const repository = CreateInMemoryAnalyticsRepository();
      const spy = jest.spyOn(repository, "getPageViews");
      const service = CreateLocalAnalyticsService(repository, stubLogger(), () => fixedNow);
      await service.recordPageView(viewInput({ occurredAt: new Date("2026-07-01T08:00:00.000Z") }));

      const first = await unwrap(service.getSummary("all", "week"));
      expect(first.cacheStatus).toBe("live");
      expect(spy).toHaveBeenCalledTimes(1);

      const second = await unwrap(service.getSummary("all", "week"));
      expect(second.cacheStatus).toBe("cached");
      expect(spy).toHaveBeenCalledTimes(1);

      fixedNow = new Date("2026-07-01T12:01:01.000Z");
      const third = await unwrap(service.getSummary("all", "week"));
      expect(third.cacheStatus).toBe("live");
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("returns an error without a cache and a stale summary with one when the repository fails", async () => {
      let fixedNow = new Date("2026-07-01T12:00:00.000Z");
      const repository = new TogglingAnalyticsRepository();
      const service = CreateLocalAnalyticsService(repository, stubLogger(), () => fixedNow);
      await service.recordPageView(viewInput({ occurredAt: new Date("2026-07-01T08:00:00.000Z") }));

      const coldService = CreateLocalAnalyticsService(repository, stubLogger(), () => fixedNow);
      repository.fail = true;
      const failed = await coldService.getSummary("all", "week");
      expect(failed.ok).toBe(false);
      if (failed.ok === false) {
        expect(failed.value.name).toBe("AnalyticsUnavailable");
        expect(failed.value.message).toBe("boom");
      }

      repository.fail = false;
      const warm = await unwrap(service.getSummary("all", "week"));
      expect(warm.cacheStatus).toBe("live");

      repository.fail = true;
      fixedNow = new Date("2026-07-01T12:02:00.000Z");
      const stale = await unwrap(service.getSummary("all", "week"));
      expect(stale.cacheStatus).toBe("stale");
      expect(stale.pageviews).toBe(1);
      expect(stale.message).toContain("boom");
    });
  });

  describe("edge cases", () => {
    it("returns a zeroed summary with a message when no data has been recorded", async () => {
      const service = CreateLocalAnalyticsService(CreateInMemoryAnalyticsRepository(), stubLogger(), () => FIXED_NOW);

      const summary = await unwrap(service.getSummary("all", "all"));

      expect(summary.configured).toBe(true);
      expect(summary.visits).toBe(0);
      expect(summary.pageviews).toBe(0);
      expect(summary.visitors).toBe(0);
      expect(summary.averageVisitLengthSeconds).toBe(0);
      expect(summary.bounceRate).toBe(0);
      expect(summary.pageviewSeries).toEqual([]);
      expect(summary.topContent).toEqual([]);
      expect(summary.deviceBreakdown).toEqual([]);
      expect(summary.referrerBreakdown).toEqual([]);
      expect(summary.message).toContain("No pageview data recorded yet");
    });

    it("resolves recordPageView without throwing and warns when the insert fails", async () => {
      const logger = stubLogger();
      const failingRepository: IAnalyticsRepository = {
        insertPageView: async () => Err(AnalyticsDatabaseError("insert failed")),
        getPageViews: async () => Ok([]),
      };
      const service = CreateLocalAnalyticsService(failingRepository, logger, () => FIXED_NOW);

      await expect(service.recordPageView(viewInput())).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("insert failed"));
    });
  });
});
