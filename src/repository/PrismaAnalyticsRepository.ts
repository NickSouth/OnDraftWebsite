import { Err, Ok, type Result } from "../lib/result";
import type { OnDraftPrismaClient } from "../prisma/client";
import type { AnalyticsDeviceType } from "../service/AnalyticsService";
import {
  AnalyticsDatabaseError,
  type AnalyticsRepositoryError,
  type IAnalyticsRepository,
  type PageViewQuery,
  type PageViewRecord,
  type PageViewRow,
} from "./AnalyticsRepository";

function normalizeDeviceType(value: string): AnalyticsDeviceType {
  return value === "mobile" || value === "tablet" ? value : "desktop";
}

class PrismaAnalyticsRepository implements IAnalyticsRepository {
  constructor(private readonly prisma: OnDraftPrismaClient) {}

  async insertPageView(view: PageViewRecord): Promise<Result<void, AnalyticsRepositoryError>> {
    try {
      await this.prisma.pageView.create({
        data: {
          id: view.id,
          path: view.path,
          occurredAt: view.occurredAt,
          browserId: view.browserId,
          referrerHost: view.referrerHost,
          userAgent: view.userAgent,
          deviceType: view.deviceType,
          authenticated: view.authenticated,
          isAdmin: view.isAdmin,
          isBot: view.isBot,
        },
      });
      return Ok(undefined);
    } catch (error) {
      return Err(AnalyticsDatabaseError(error instanceof Error ? error.message : "Unable to record page view."));
    }
  }

  async getPageViews(query: PageViewQuery): Promise<Result<PageViewRow[], AnalyticsRepositoryError>> {
    try {
      const where = {
        occurredAt: {
          ...(query.startAt ? { gte: query.startAt } : {}),
          lte: query.endAt,
        },
        ...(query.excludeAdmin ? { isAdmin: false } : {}),
        ...(query.excludeBots ? { isBot: false } : {}),
        ...(query.pathPrefix === null
          ? {}
          : query.pathPrefix === "/"
            ? { path: "/" }
            : { OR: [{ path: query.pathPrefix }, { path: { startsWith: `${query.pathPrefix}/` } }] }),
      };
      const rows = await this.prisma.pageView.findMany({
        where,
        orderBy: { occurredAt: "asc" },
        select: {
          path: true,
          occurredAt: true,
          browserId: true,
          deviceType: true,
          referrerHost: true,
        },
      });
      return Ok(rows.map((row): PageViewRow => ({
        path: row.path,
        occurredAt: row.occurredAt,
        browserId: row.browserId,
        deviceType: normalizeDeviceType(row.deviceType),
        referrerHost: row.referrerHost,
      })));
    } catch (error) {
      return Err(AnalyticsDatabaseError(error instanceof Error ? error.message : "Unable to load page views."));
    }
  }
}

export function CreatePrismaAnalyticsRepository(prisma: OnDraftPrismaClient): IAnalyticsRepository {
  return new PrismaAnalyticsRepository(prisma);
}
