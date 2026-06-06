import { CreateUmamiAnalyticsService } from "../../src/service/UmamiAnalyticsService";

describe("UmamiAnalyticsService", () => {
  it("returns configuration diagnostics when analytics is not fully configured", async () => {
    const service = CreateUmamiAnalyticsService({
      umamiWebsiteId: "website-id",
      umamiApiKey: null,
      umamiApiBaseUrl: "https://api.umami.is/v1",
    });

    const summary = await service.getSummary("all");

    expect(summary.ok).toBe(true);
    if (summary.ok === true) {
      expect(summary.value.configured).toBe(false);
      expect(summary.value.websiteConfigured).toBe(true);
      expect(summary.value.apiKeyConfigured).toBe(false);
    }
  });

  it("queries Umami Cloud with an API key, documented filters object, and chart data", async () => {
    const requestedUrls: URL[] = [];
    const fetcher = jest.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requestedUrls.push(input instanceof URL ? input : new URL(String(input)));
      expect(init?.headers).toMatchObject({
        Accept: "application/json",
        "x-umami-api-key": "api-key",
      });
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith("/stats")) {
        return new Response(JSON.stringify({ pageviews: 12, visitors: 7, visits: 8, bounces: 2, totaltime: 160 }));
      }
      if (url.pathname.endsWith("/pageviews")) {
        return new Response(JSON.stringify({
          pageviews: [{ x: "2026-06-01T00:00:00Z", y: 12 }],
          sessions: [{ x: "2026-06-01T00:00:00Z", y: 8 }],
        }));
      }
      if (url.searchParams.get("type") === "device") {
        return new Response(JSON.stringify([{ x: "Desktop", y: 6 }]));
      }
      if (url.searchParams.get("type") === "referrer") {
        return new Response(JSON.stringify([{ x: "Direct", y: 4 }]));
      }
      return new Response(JSON.stringify([{ x: "/articles/a1001", y: 5 }]));
    });
    const service = CreateUmamiAnalyticsService({
      umamiWebsiteId: "website-id",
      umamiApiKey: "api-key",
      umamiApiBaseUrl: "https://api.umami.is/v1",
    }, fetcher as typeof fetch);

    const summary = await service.getSummary("articles");

    expect(summary.ok).toBe(true);
    expect(requestedUrls).toHaveLength(5);
    expect(requestedUrls[0].toString()).toContain("https://api.umami.is/v1/websites/website-id/stats");
    expect(requestedUrls[0].searchParams.get("filters")).toBe(JSON.stringify({ path: "/articles" }));
    expect(requestedUrls[1].searchParams.get("type")).toBe("path");
    expect(requestedUrls[2].pathname).toContain("/pageviews");
    expect(requestedUrls[2].searchParams.get("unit")).toBe("day");
    if (summary.ok === true) {
      expect(summary.value.visits).toBe(8);
      expect(summary.value.bounceRate).toBe(25);
      expect(summary.value.averageVisitLengthSeconds).toBe(20);
      expect(summary.value.period).toBe("month");
      expect(summary.value.pageviewSeries[0]).toEqual({ timestamp: "2026-06-01T00:00:00Z", pageviews: 12, sessions: 8 });
      expect(summary.value.topContent[0]).toEqual({ path: "/articles/a1001", visitors: 5 });
      expect(summary.value.deviceBreakdown[0]).toEqual({ name: "Desktop", visitors: 6 });
      expect(summary.value.referrerBreakdown[0]).toEqual({ name: "Direct", visitors: 4 });
    }
  });

  it("caches repeated analytics requests for the same category and period", async () => {
    const fetcher = jest.fn(async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith("/stats")) {
        return new Response(JSON.stringify({ pageviews: 3, visitors: 2, visits: 2, bounces: 1, totaltime: 20 }));
      }
      if (url.pathname.endsWith("/pageviews")) {
        return new Response(JSON.stringify({ pageviews: [], sessions: [] }));
      }
      return new Response(JSON.stringify([]));
    });
    const service = CreateUmamiAnalyticsService({
      umamiWebsiteId: "website-id",
      umamiApiKey: "api-key",
      umamiApiBaseUrl: "https://api.umami.is/v1",
    }, fetcher as typeof fetch);

    const first = await service.getSummary("all", "week");
    const second = await service.getSummary("all", "week");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(5);
    if (second.ok === true) {
      expect(second.value.cacheStatus).toBe("cached");
      expect(second.value.period).toBe("week");
    }
  });

  it("returns API errors with diagnostics and response details", async () => {
    const service = CreateUmamiAnalyticsService({
      umamiWebsiteId: "website-id",
      umamiApiKey: "api-key",
      umamiApiBaseUrl: "https://api.umami.is/v1",
    }, (async () => new Response("Invalid key", { status: 401 })) as typeof fetch);

    const summary = await service.getSummary("all");

    expect(summary.ok).toBe(false);
    if (summary.ok === false) {
      expect(summary.value.message).toContain("status 401");
      expect(summary.value.message).toContain("Invalid key");
      expect(summary.value.websiteConfigured).toBe(true);
      expect(summary.value.apiKeyConfigured).toBe(true);
      expect(summary.value.apiBaseUrl).toBe("https://api.umami.is/v1");
    }
  });
});
