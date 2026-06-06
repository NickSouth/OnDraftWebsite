import type { IAnalyticsConfig } from "../config/AppConfig";
import { Err, Ok, type Result } from "../lib/result";

export type AnalyticsCategory = "all" | "articles" | "videos" | "home" | "draft-board" | "taproom";

export interface AnalyticsSummary {
  configured: boolean;
  category: AnalyticsCategory;
  visits: number | null;
  pageviews: number | null;
  visitors: number | null;
  averageVisitLengthSeconds: number | null;
  bounceRate: number | null;
  topContent: Array<{ path: string; visitors: number }>;
  message?: string;
}

export type AnalyticsError = { name: "AnalyticsUnavailable"; message: string };

export interface IAnalyticsService {
  getSummary(category: AnalyticsCategory): Promise<Result<AnalyticsSummary, AnalyticsError>>;
}

type UmamiStatsResponse = {
  pageviews?: number;
  visitors?: number;
  visits?: number;
  bounces?: number;
  totaltime?: number;
};

type UmamiMetricResponse = Array<{ x?: string; y?: number }>;

const CATEGORY_PATHS: Record<AnalyticsCategory, string | null> = {
  all: null,
  articles: "/articles",
  videos: "/videos",
  home: "/",
  "draft-board": "/bigboard",
  taproom: "/hottakes",
};

class UmamiAnalyticsService implements IAnalyticsService {
  constructor(
    private readonly config: IAnalyticsConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async getSummary(category: AnalyticsCategory): Promise<Result<AnalyticsSummary, AnalyticsError>> {
    if (!this.config.umamiWebsiteId || !this.config.umamiApiKey) {
      return Ok({
        configured: false,
        category,
        visits: null,
        pageviews: null,
        visitors: null,
        averageVisitLengthSeconds: null,
        bounceRate: null,
        topContent: [],
        message: "Set UMAMI_API_KEY to show live dashboard analytics.",
      });
    }

    const endAt = Date.now();
    const startAt = endAt - 30 * 24 * 60 * 60 * 1000;
    const pathFilter = CATEGORY_PATHS[category];
    const statsUrl = this.url(`/websites/${this.config.umamiWebsiteId}/stats`, startAt, endAt, pathFilter);
    const metricsUrl = this.url(`/websites/${this.config.umamiWebsiteId}/metrics`, startAt, endAt, pathFilter);
    metricsUrl.searchParams.set("type", "path");
    metricsUrl.searchParams.set("limit", "5");

    try {
      const [statsResponse, metricsResponse] = await Promise.all([
        this.fetchJson<UmamiStatsResponse>(statsUrl),
        this.fetchJson<UmamiMetricResponse>(metricsUrl),
      ]);
      if (statsResponse.ok === false) {
        return Err(statsResponse.value);
      }
      if (metricsResponse.ok === false) {
        return Err(metricsResponse.value);
      }

      const stats = statsResponse.value;
      const visits = stats.visits ?? 0;
      return Ok({
        configured: true,
        category,
        visits,
        pageviews: stats.pageviews ?? 0,
        visitors: stats.visitors ?? 0,
        averageVisitLengthSeconds: visits > 0 ? Math.round((stats.totaltime ?? 0) / visits) : 0,
        bounceRate: visits > 0 ? Math.round(((stats.bounces ?? 0) / visits) * 100) : 0,
        topContent: metricsResponse.value.map((item) => ({
          path: item.x ?? "",
          visitors: item.y ?? 0,
        })),
      });
    } catch {
      const error: AnalyticsError = { name: "AnalyticsUnavailable", message: "Unable to load Umami analytics." };
      return Err(error);
    }
  }

  private url(path: string, startAt: number, endAt: number, pathFilter: string | null): URL {
    const url = new URL(path.replace(/^\//, ""), this.normalizedBaseUrl());
    url.searchParams.set("startAt", String(startAt));
    url.searchParams.set("endAt", String(endAt));
    if (pathFilter) {
      url.searchParams.set("path", pathFilter);
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
      const error: AnalyticsError = { name: "AnalyticsUnavailable", message: `Umami request failed with status ${response.status}.` };
      return Err(error);
    }
    return Ok(await response.json() as T);
  }
}

export function CreateUmamiAnalyticsService(
  config: IAnalyticsConfig,
  fetcher?: typeof fetch,
): IAnalyticsService {
  return new UmamiAnalyticsService(config, fetcher);
}
