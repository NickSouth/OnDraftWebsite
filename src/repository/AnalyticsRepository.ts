import type { Result } from "../lib/result";
import type { AnalyticsDeviceType } from "../service/AnalyticsService";

export type AnalyticsRepositoryError = {
  name: "DatabaseError";
  message: string;
};

export const AnalyticsDatabaseError = (message: string): AnalyticsRepositoryError => ({
  name: "DatabaseError",
  message,
});

export interface PageViewRecord {
  id: string;
  path: string;
  occurredAt: Date;
  browserId: string;
  referrerHost: string | null;
  userAgent: string | null;
  deviceType: AnalyticsDeviceType;
  authenticated: boolean;
  isAdmin: boolean;
  isBot: boolean;
}

export type PageViewRow = Pick<PageViewRecord, "path" | "occurredAt" | "browserId" | "deviceType" | "referrerHost">;

export interface PageViewQuery {
  startAt: Date | null;
  endAt: Date;
  pathPrefix: string | null;
  excludeAdmin: boolean;
  excludeBots: boolean;
}

export interface IAnalyticsRepository {
  insertPageView(view: PageViewRecord): Promise<Result<void, AnalyticsRepositoryError>>;
  getPageViews(query: PageViewQuery): Promise<Result<PageViewRow[], AnalyticsRepositoryError>>;
}
