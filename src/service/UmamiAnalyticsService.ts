import type { IAnalyticsConfig } from "../config/AppConfig";
import { Err, Ok, type Result } from "../lib/result";

export type AnalyticsCategory = "all" | "articles" | "videos" | "home" | "draft-board" | "taproom";
export type AnalyticsPeriod = "week" | "month" | "all";

export type AnalyticsSeriesPoint = {
  timestamp: string;
  pageviews: number;
  sessions: number;
};

export interface AnalyticsSummary {
  configured: boolean;
  category: AnalyticsCategory;
  period: AnalyticsPeriod;
  rangeLabel: string;
  websiteConfigured: boolean;
  apiKeyConfigured: boolean;
  apiBaseUrl: string;
  cachedAt: Date | null;
  cacheStatus: "live" | "cached" | "stale" | "unconfigured";
  visits: number | null;
  pageviews: number | null;
  visitors: number | null;
  averageVisitLengthSeconds: number | null;
  bounceRate: number | null;
  pageviewSeries: AnalyticsSeriesPoint[];
  topContent: Array<{ path: string; visitors: number }>;
  deviceBreakdown: Array<{ name: string; visitors: number }>;
  referrerBreakdown: Array<{ name: string; visitors: number }>;
  message?: string;
}

export type AnalyticsError = {
  name: "AnalyticsUnavailable";
  message: string;
  websiteConfigured?: boolean;
  apiKeyConfigured?: boolean;
  apiBaseUrl?: string;
};

export interface IAnalyticsService {
  getSummary(category: AnalyticsCategory, period?: AnalyticsPeriod): Promise<Result<AnalyticsSummary, AnalyticsError>>;
}

type UmamiStatsResponse = {
  pageviews?: number;
  visitors?: number;
  visits?: number;
  bounces?: number;
  totaltime?: number;
};

type UmamiMetricResponse = Array<{ x?: string; y?: number }>;
type UmamiPageviewsResponse = {
  pageviews?: UmamiMetricResponse;
  sessions?: UmamiMetricResponse;
};

const CATEGORY_PATHS: Record<AnalyticsCategory, string | null> = {
  all: null,
  articles: "/articles",
  videos: "/videos",
  home: "/",
  "draft-board": "/bigboard",
  taproom: "/hottakes",
};

const CACHE_TTL_MS = 60_000;
const CACHE_STALE_MS = 10 * 60_000;
const MIN_UPSTREAM_INTERVAL_MS = 15_000;

const PERIOD_SETTINGS: Record<AnalyticsPeriod, { label: string; durationMs: number | null; unit: "day" | "month" }> = {
  week: { label: "Last week", durationMs: 7 * 24 * 60 * 60 * 1000, unit: "day" },
  month: { label: "Last month", durationMs: 30 * 24 * 60 * 60 * 1000, unit: "day" },
  all: { label: "All time", durationMs: null, unit: "month" },
};

type CacheEntry = {
  value: AnalyticsSummary;
  expiresAt: number;
  staleUntil: number;
  fetchedAt: number;
};

class UmamiAnalyticsService implements IAnalyticsService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<Result<AnalyticsSummary, AnalyticsError>>>();
  private readonly lastUpstreamAttemptByKey = new Map<string, number>();

  constructor(
    private readonly config: IAnalyticsConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async getSummary(category: AnalyticsCategory, period: AnalyticsPeriod = "month"): Promise<Result<AnalyticsSummary, AnalyticsError>> {
    const apiBaseUrl = this.normalizedBaseUrl().replace(/\/$/, "");
    const websiteConfigured = Boolean(this.config.umamiWebsiteId);
    const apiKeyConfigured = Boolean(this.config.umamiApiKey);
    if (!this.config.umamiWebsiteId || !this.config.umamiApiKey) {
      return Ok({
        configured: false,
        category,
        period,
        rangeLabel: PERIOD_SETTINGS[period].label,
        websiteConfigured,
        apiKeyConfigured,
        apiBaseUrl,
        cachedAt: null,
        cacheStatus: "unconfigured",
        visits: null,
        pageviews: null,
        visitors: null,
        averageVisitLengthSeconds: null,
        bounceRate: null,
        pageviewSeries: [],
        topContent: [],
        deviceBreakdown: [],
        referrerBreakdown: [],
        message: websiteConfigured
          ? "Umami tracking is configured. Add UMAMI_API_KEY only if you want this dashboard to fetch live Umami stats."
          : "Set UMAMI_WEBSITE_ID to enable Umami tracking. Add UMAMI_API_KEY only if you want this dashboard to fetch live Umami stats.",
      });
    }

    const key = `${category}:${period}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return Ok(this.withCacheStatus(cached.value, "cached", cached.fetchedAt));
    }

    const inFlight = this.inFlight.get(key);
    if (inFlight) {
      return inFlight;
    }

    const lastAttempt = this.lastUpstreamAttemptByKey.get(key) ?? 0;
    if (cached && cached.staleUntil > now && now - lastAttempt < MIN_UPSTREAM_INTERVAL_MS) {
      return Ok(this.withCacheStatus(cached.value, "stale", cached.fetchedAt, "Showing recently cached analytics to avoid over-querying Umami."));
    }

    this.lastUpstreamAttemptByKey.set(key, now);
    const request = this.loadSummary(category, period, now);
    this.inFlight.set(key, request);
    const result = await request;
    this.inFlight.delete(key);
    return result;
  }

  private async loadSummary(category: AnalyticsCategory, period: AnalyticsPeriod, now: number): Promise<Result<AnalyticsSummary, AnalyticsError>> {
    const apiBaseUrl = this.normalizedBaseUrl().replace(/\/$/, "");
    const websiteConfigured = Boolean(this.config.umamiWebsiteId);
    const apiKeyConfigured = Boolean(this.config.umamiApiKey);
    const endAt = Date.now();
    const periodSettings = PERIOD_SETTINGS[period];
    const startAt = periodSettings.durationMs === null ? 0 : endAt - periodSettings.durationMs;
    const pathFilter = CATEGORY_PATHS[category];
    const statsUrl = this.url(`/websites/${this.config.umamiWebsiteId}/stats`, startAt, endAt, pathFilter);
    const metricsUrl = this.url(`/websites/${this.config.umamiWebsiteId}/metrics`, startAt, endAt, pathFilter);
    metricsUrl.searchParams.set("type", "path");
    metricsUrl.searchParams.set("limit", "6");
    const pageviewsUrl = this.url(`/websites/${this.config.umamiWebsiteId}/pageviews`, startAt, endAt, pathFilter);
    pageviewsUrl.searchParams.set("unit", periodSettings.unit);
    const deviceUrl = this.url(`/websites/${this.config.umamiWebsiteId}/metrics`, startAt, endAt, pathFilter);
    deviceUrl.searchParams.set("type", "device");
    deviceUrl.searchParams.set("limit", "5");
    const referrerUrl = this.url(`/websites/${this.config.umamiWebsiteId}/metrics`, startAt, endAt, pathFilter);
    referrerUrl.searchParams.set("type", "referrer");
    referrerUrl.searchParams.set("limit", "5");

    try {
      const [statsResponse, metricsResponse, pageviewsResponse, deviceResponse, referrerResponse] = await Promise.all([
        this.fetchJson<UmamiStatsResponse>(statsUrl),
        this.fetchJson<UmamiMetricResponse>(metricsUrl),
        this.fetchJson<UmamiPageviewsResponse>(pageviewsUrl),
        this.fetchJson<UmamiMetricResponse>(deviceUrl),
        this.fetchJson<UmamiMetricResponse>(referrerUrl),
      ]);
      if (statsResponse.ok === false) {
        return this.staleOrError(category, period, statsResponse.value);
      }
      if (metricsResponse.ok === false) {
        return this.staleOrError(category, period, metricsResponse.value);
      }
      if (pageviewsResponse.ok === false) {
        return this.staleOrError(category, period, pageviewsResponse.value);
      }
      if (deviceResponse.ok === false) {
        return this.staleOrError(category, period, deviceResponse.value);
      }
      if (referrerResponse.ok === false) {
        return this.staleOrError(category, period, referrerResponse.value);
      }

      const stats = statsResponse.value;
      const visits = stats.visits ?? 0;
      const summary: AnalyticsSummary = {
        configured: true,
        category,
        period,
        rangeLabel: periodSettings.label,
        websiteConfigured,
        apiKeyConfigured,
        apiBaseUrl,
        cachedAt: new Date(now),
        cacheStatus: "live",
        visits,
        pageviews: stats.pageviews ?? 0,
        visitors: stats.visitors ?? 0,
        averageVisitLengthSeconds: visits > 0 ? Math.round((stats.totaltime ?? 0) / visits) : 0,
        bounceRate: visits > 0 ? Math.round(((stats.bounces ?? 0) / visits) * 100) : 0,
        pageviewSeries: this.mergePageviewSeries(pageviewsResponse.value),
        topContent: metricsResponse.value.map((item) => ({
          path: item.x ?? "",
          visitors: item.y ?? 0,
        })),
        deviceBreakdown: deviceResponse.value.map((item) => ({
          name: item.x || "Unknown",
          visitors: item.y ?? 0,
        })),
        referrerBreakdown: referrerResponse.value.map((item) => ({
          name: item.x || "Direct",
          visitors: item.y ?? 0,
        })),
      };
      this.cache.set(`${category}:${period}`, {
        value: summary,
        expiresAt: now + CACHE_TTL_MS,
        staleUntil: now + CACHE_STALE_MS,
        fetchedAt: now,
      });
      return Ok(summary);
    } catch {
      const error = this.error("Unable to load Umami analytics.");
      return this.staleOrError(category, period, error);
    }
  }

  private staleOrError(category: AnalyticsCategory, period: AnalyticsPeriod, error: AnalyticsError): Result<AnalyticsSummary, AnalyticsError> {
    const cached = this.cache.get(`${category}:${period}`);
    if (cached && cached.staleUntil > Date.now()) {
      return Ok(this.withCacheStatus(cached.value, "stale", cached.fetchedAt, `Showing cached analytics because Umami is unavailable: ${error.message}`));
    }
    return Err(error);
  }

  private mergePageviewSeries(response: UmamiPageviewsResponse): AnalyticsSeriesPoint[] {
    const sessionsByTimestamp = new Map((response.sessions ?? []).map((point) => [point.x ?? "", point.y ?? 0]));
    return (response.pageviews ?? []).map((point) => ({
      timestamp: point.x ?? "",
      pageviews: point.y ?? 0,
      sessions: sessionsByTimestamp.get(point.x ?? "") ?? 0,
    }));
  }

  private withCacheStatus(
    summary: AnalyticsSummary,
    cacheStatus: AnalyticsSummary["cacheStatus"],
    fetchedAt: number,
    message = summary.message,
  ): AnalyticsSummary {
    return {
      ...summary,
      cachedAt: new Date(fetchedAt),
      cacheStatus,
      message,
    };
  }

  private url(path: string, startAt: number, endAt: number, pathFilter: string | null): URL {
    const url = new URL(path.replace(/^\//, ""), this.normalizedBaseUrl());
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("endAt", String(endAt));
    if (pathFilter) {
      url.searchParams.set("filters", JSON.stringify({ path: pathFilter }));
    }
    return url;
  }

  private normalizedBaseUrl(): string {
    return this.config.umamiApiBaseUrl.endsWith("/")
      ? this.config.umamiApiBaseUrl
      : `${this.config.umamiApiBaseUrl}/`;
  }

  private async fetchJson<T>(url: URL): Promise<Result<T, AnalyticsError>> {
    const response = await this.fetcher(url, {
      headers: {
        Accept: "application/json",
        "x-umami-api-key": this.config.umamiApiKey ?? "",
      },
    });
    if (!response.ok) {
      const responseText = await this.safeResponseText(response);
      const details = responseText ? ` ${responseText.slice(0, 220)}` : "";
      const error = this.error(`Umami request failed with status ${response.status}.${details}`);
      return Err(error);
    }
    return Ok(await response.json() as T);
  }

  private async safeResponseText(response: Response): Promise<string> {
    try {
      return (await response.text()).trim();
    } catch {
      return "";
    }
  }

  private error(message: string): AnalyticsError {
    return {
      name: "AnalyticsUnavailable",
      message,
      websiteConfigured: Boolean(this.config.umamiWebsiteId),
      apiKeyConfigured: Boolean(this.config.umamiApiKey),
      apiBaseUrl: this.normalizedBaseUrl().replace(/\/$/, ""),
    };
  }
}

export function CreateUmamiAnalyticsService(
  config: IAnalyticsConfig,
  fetcher?: typeof fetch,
): IAnalyticsService {
  return new UmamiAnalyticsService(config, fetcher);
}
