import type { Result } from "../lib/result";

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

export const ANALYTICS_CATEGORY_PATHS: Record<AnalyticsCategory, string | null> = {
  all: null,
  articles: "/articles",
  videos: "/videos",
  home: "/",
  "draft-board": "/bigboard",
  taproom: "/hottakes",
};

export const ANALYTICS_PERIOD_SETTINGS: Record<AnalyticsPeriod, { label: string; durationMs: number | null; unit: "day" | "month" }> = {
  week: { label: "Last week", durationMs: 7 * 24 * 60 * 60 * 1000, unit: "day" },
  month: { label: "Last month", durationMs: 30 * 24 * 60 * 60 * 1000, unit: "day" },
  all: { label: "All time", durationMs: null, unit: "month" },
};

export type AnalyticsDeviceType = "desktop" | "mobile" | "tablet";

export interface PageViewInput {
  path: string;
  browserId: string;
  referrer: string | null;
  userAgent: string | null;
  host: string | null;
  authenticated: boolean;
  isAdmin: boolean;
  occurredAt?: Date;
}

export interface IPageViewRecorder {
  recordPageView(input: PageViewInput): Promise<void>;
}
