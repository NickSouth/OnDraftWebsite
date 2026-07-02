import { randomUUID } from "node:crypto";
import { Err, Ok, type Result } from "../lib/result";
import {
  ANALYTICS_CATEGORY_PATHS,
  ANALYTICS_PERIOD_SETTINGS,
  type AnalyticsCategory,
  type AnalyticsDeviceType,
  type AnalyticsError,
  type AnalyticsPeriod,
  type AnalyticsSeriesPoint,
  type AnalyticsSummary,
  type IAnalyticsService,
  type IPageViewRecorder,
  type PageViewInput,
} from "./AnalyticsService";
import type { IAnalyticsRepository, PageViewRecord, PageViewRow } from "../repository/AnalyticsRepository";
import type { ILoggingService } from "./LoggingService";

const CACHE_TTL_MS = 60_000;
const CACHE_STALE_MS = 10 * 60_000;
const VISIT_GAP_MS = 30 * 60 * 1000;
const USER_AGENT_MAX_LENGTH = 400;

const BOT_USER_AGENT_PATTERN = /bot|crawl|spider|slurp|headless|lighthouse|python-requests|curl|wget|facebookexternalhit|bingpreview|pingdom|uptime/i;
const TABLET_PATTERN = /ipad|tablet|kindle|silk|playbook/;
const MOBILE_PATTERN = /mobi|iphone|ipod|android|windows phone/;

const DEVICE_DISPLAY_NAMES: Record<AnalyticsDeviceType, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
};

type CacheEntry = {
  value: AnalyticsSummary;
  expiresAt: number;
  staleUntil: number;
  fetchedAt: number;
};

type Visit = {
  browserId: string;
  pageviewCount: number;
  startAt: Date;
  endAt: Date;
  rows: PageViewRow[];
};

class LocalAnalyticsService implements IAnalyticsService, IPageViewRecorder {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<Result<AnalyticsSummary, AnalyticsError>>>();

  constructor(
    private readonly repository: IAnalyticsRepository,
    private readonly logger: ILoggingService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async recordPageView(input: PageViewInput): Promise<void> {
    try {
      const record: PageViewRecord = {
        id: randomUUID(),
        path: input.path,
        occurredAt: input.occurredAt ?? this.now(),
        browserId: input.browserId,
        referrerHost: this.externalReferrerHost(input.referrer, input.host),
        userAgent: input.userAgent ? input.userAgent.slice(0, USER_AGENT_MAX_LENGTH) : null,
        deviceType: this.deviceType(input.userAgent),
        authenticated: input.authenticated,
        isAdmin: input.isAdmin,
        isBot: this.isBot(input.userAgent),
      };
      const result = await this.repository.insertPageView(record);
      if (result.ok === false) {
        this.logger.warn(`Failed to record page view: ${result.value.message}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to record page view: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getSummary(category: AnalyticsCategory, period: AnalyticsPeriod = "month"): Promise<Result<AnalyticsSummary, AnalyticsError>> {
    const key = `${category}:${period}`;
    const nowMs = this.now().getTime();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > nowMs) {
      return Ok(this.withCacheStatus(cached.value, "cached", cached.fetchedAt));
    }

    const inFlight = this.inFlight.get(key);
    if (inFlight) {
      return inFlight;
    }

    const request = this.loadSummary(category, period, nowMs);
    this.inFlight.set(key, request);
    const result = await request;
    this.inFlight.delete(key);
    return result;
  }

  private async loadSummary(category: AnalyticsCategory, period: AnalyticsPeriod, nowMs: number): Promise<Result<AnalyticsSummary, AnalyticsError>> {
    const settings = ANALYTICS_PERIOD_SETTINGS[period];
    const endAt = this.now();
    const startAt = settings.durationMs === null ? null : new Date(endAt.getTime() - settings.durationMs);
    const rows = await this.repository.getPageViews({
      startAt,
      endAt,
      pathPrefix: ANALYTICS_CATEGORY_PATHS[category],
      excludeAdmin: true,
      excludeBots: true,
    });
    if (rows.ok === false) {
      return this.staleOrError(category, period, {
        name: "AnalyticsUnavailable",
        message: rows.value.message,
      });
    }

    const visits = this.sessionize(rows.value);
    const pageviews = rows.value.length;
    const visitors = new Set(rows.value.map((row) => row.browserId)).size;
    const visitCount = visits.length;
    const totalVisitSeconds = visits.reduce((sum, visit) => sum + (visit.endAt.getTime() - visit.startAt.getTime()) / 1000, 0);
    const averageVisitLengthSeconds = visitCount > 0 ? Math.round(totalVisitSeconds / visitCount) : 0;
    const bounces = visits.filter((visit) => visit.pageviewCount === 1).length;
    const bounceRate = visitCount > 0 ? Math.round((100 * bounces) / visitCount) : 0;

    const summary: AnalyticsSummary = {
      configured: true,
      category,
      period,
      rangeLabel: settings.label,
      websiteConfigured: true,
      apiKeyConfigured: true,
      apiBaseUrl: "local",
      cachedAt: new Date(nowMs),
      cacheStatus: "live",
      visits: visitCount,
      pageviews,
      visitors,
      averageVisitLengthSeconds,
      bounceRate,
      pageviewSeries: this.buildSeries(rows.value, visits, settings.unit, startAt, endAt),
      topContent: this.distinctVisitorBreakdown(rows.value, (row) => row.path, 6)
        .map((item) => ({ path: item.name, visitors: item.visitors })),
      deviceBreakdown: this.distinctVisitorBreakdown(rows.value, (row) => DEVICE_DISPLAY_NAMES[row.deviceType], 5),
      referrerBreakdown: this.distinctVisitorBreakdown(rows.value, (row) => row.referrerHost ?? "Direct", 5),
      message: rows.value.length === 0
        ? "No pageview data recorded yet. History begins when local analytics first deployed."
        : undefined,
    };
    this.cache.set(`${category}:${period}`, {
      value: summary,
      expiresAt: nowMs + CACHE_TTL_MS,
      staleUntil: nowMs + CACHE_STALE_MS,
      fetchedAt: nowMs,
    });
    return Ok(summary);
  }

  private staleOrError(category: AnalyticsCategory, period: AnalyticsPeriod, error: AnalyticsError): Result<AnalyticsSummary, AnalyticsError> {
    const cached = this.cache.get(`${category}:${period}`);
    if (cached && cached.staleUntil > this.now().getTime()) {
      return Ok(this.withCacheStatus(cached.value, "stale", cached.fetchedAt, `Showing cached analytics because fresh data is unavailable: ${error.message}`));
    }
    return Err(error);
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

  private sessionize(rows: PageViewRow[]): Visit[] {
    const rowsByBrowser = new Map<string, PageViewRow[]>();
    for (const row of rows) {
      const group = rowsByBrowser.get(row.browserId);
      if (group) {
        group.push(row);
      } else {
        rowsByBrowser.set(row.browserId, [row]);
      }
    }

    const visits: Visit[] = [];
    for (const [browserId, group] of rowsByBrowser) {
      let current: Visit | null = null;
      for (const row of group) {
        if (current && row.occurredAt.getTime() - current.endAt.getTime() <= VISIT_GAP_MS) {
          current.pageviewCount += 1;
          current.endAt = row.occurredAt;
          current.rows.push(row);
        } else {
          current = {
            browserId,
            pageviewCount: 1,
            startAt: row.occurredAt,
            endAt: row.occurredAt,
            rows: [row],
          };
          visits.push(current);
        }
      }
    }
    return visits;
  }

  private buildSeries(rows: PageViewRow[], visits: Visit[], unit: "day" | "month", startAt: Date | null, endAt: Date): AnalyticsSeriesPoint[] {
    if (rows.length === 0 && startAt === null) {
      return [];
    }

    const firstBucketSource = startAt ?? rows[0].occurredAt;
    const pageviewsByBucket = new Map<string, number>();
    for (const row of rows) {
      const bucket = this.bucketKey(row.occurredAt, unit);
      pageviewsByBucket.set(bucket, (pageviewsByBucket.get(bucket) ?? 0) + 1);
    }
    const sessionsByBucket = new Map<string, number>();
    for (const visit of visits) {
      const bucketsForVisit = new Set(visit.rows.map((row) => this.bucketKey(row.occurredAt, unit)));
      for (const bucket of bucketsForVisit) {
        sessionsByBucket.set(bucket, (sessionsByBucket.get(bucket) ?? 0) + 1);
      }
    }

    const series: AnalyticsSeriesPoint[] = [];
    let cursor = this.bucketStart(firstBucketSource, unit);
    const lastBucketMs = this.bucketStart(endAt, unit).getTime();
    while (cursor.getTime() <= lastBucketMs) {
      const key = cursor.toISOString();
      series.push({
        timestamp: key,
        pageviews: pageviewsByBucket.get(key) ?? 0,
        sessions: sessionsByBucket.get(key) ?? 0,
      });
      cursor = this.nextBucket(cursor, unit);
    }
    return series;
  }

  private bucketStart(date: Date, unit: "day" | "month"): Date {
    if (unit === "month") {
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    }
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private nextBucket(bucket: Date, unit: "day" | "month"): Date {
    if (unit === "month") {
      return new Date(Date.UTC(bucket.getUTCFullYear(), bucket.getUTCMonth() + 1, 1));
    }
    return new Date(bucket.getTime() + 24 * 60 * 60 * 1000);
  }

  private bucketKey(date: Date, unit: "day" | "month"): string {
    return this.bucketStart(date, unit).toISOString();
  }

  private distinctVisitorBreakdown(rows: PageViewRow[], nameOf: (row: PageViewRow) => string, limit: number): Array<{ name: string; visitors: number }> {
    const visitorsByName = new Map<string, Set<string>>();
    for (const row of rows) {
      const name = nameOf(row);
      const visitors = visitorsByName.get(name);
      if (visitors) {
        visitors.add(row.browserId);
      } else {
        visitorsByName.set(name, new Set([row.browserId]));
      }
    }
    return [...visitorsByName.entries()]
      .map(([name, visitors]) => ({ name, visitors: visitors.size }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, limit);
  }

  private externalReferrerHost(referrer: string | null, host: string | null): string | null {
    if (!referrer) {
      return null;
    }
    try {
      const url = new URL(referrer);
      if (host && url.host.toLowerCase() === host.toLowerCase()) {
        return null;
      }
      return url.host.toLowerCase();
    } catch {
      return null;
    }
  }

  private deviceType(userAgent: string | null): AnalyticsDeviceType {
    const ua = (userAgent ?? "").toLowerCase();
    if (TABLET_PATTERN.test(ua)) {
      return "tablet";
    }
    if (MOBILE_PATTERN.test(ua)) {
      return "mobile";
    }
    return "desktop";
  }

  private isBot(userAgent: string | null): boolean {
    if (!userAgent || userAgent.trim() === "") {
      return true;
    }
    return BOT_USER_AGENT_PATTERN.test(userAgent);
  }
}

export type ILocalAnalyticsService = IAnalyticsService & IPageViewRecorder;

export function CreateLocalAnalyticsService(
  repository: IAnalyticsRepository,
  logger: ILoggingService,
  now?: () => Date,
): ILocalAnalyticsService {
  return new LocalAnalyticsService(repository, logger, now);
}
