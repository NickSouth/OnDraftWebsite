import { Ok, type Result } from "../lib/result";
import type {
  AnalyticsRepositoryError,
  IAnalyticsRepository,
  PageViewQuery,
  PageViewRecord,
  PageViewRow,
} from "./AnalyticsRepository";

function matchesPath(path: string, pathPrefix: string | null): boolean {
  if (pathPrefix === null) {
    return true;
  }
  if (pathPrefix === "/") {
    return path === "/";
  }
  return path === pathPrefix || path.startsWith(`${pathPrefix}/`);
}

class InMemoryAnalyticsRepository implements IAnalyticsRepository {
  private readonly views: PageViewRecord[] = [];

  async insertPageView(view: PageViewRecord): Promise<Result<void, AnalyticsRepositoryError>> {
    this.views.push({ ...view });
    return Ok(undefined);
  }

  async getPageViews(query: PageViewQuery): Promise<Result<PageViewRow[], AnalyticsRepositoryError>> {
    const rows = this.views
      .filter((view) =>
        (query.startAt === null || view.occurredAt.getTime() >= query.startAt.getTime())
        && view.occurredAt.getTime() <= query.endAt.getTime()
        && matchesPath(view.path, query.pathPrefix)
        && !(query.excludeAdmin && view.isAdmin)
        && !(query.excludeBots && view.isBot))
      .map((view): PageViewRow => ({
        path: view.path,
        occurredAt: new Date(view.occurredAt.getTime()),
        browserId: view.browserId,
        deviceType: view.deviceType,
        referrerHost: view.referrerHost,
      }))
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    return Ok(rows);
  }
}

export function CreateInMemoryAnalyticsRepository(): IAnalyticsRepository {
  return new InMemoryAnalyticsRepository();
}
