import type { ILoggingService } from "./LoggingService";
import type { IOnDraftService } from "./OnDraftService";

const YOUTUBE_STATS_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface IYoutubeVideoStatsRefreshScheduler {
  start(): void;
}

class YoutubeVideoStatsRefreshScheduler implements IYoutubeVideoStatsRefreshScheduler {
  private running = false;
  private started = false;

  constructor(
    private readonly service: IOnDraftService,
    private readonly logger: ILoggingService,
    private readonly intervalMs = YOUTUBE_STATS_REFRESH_INTERVAL_MS,
  ) {}

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    const timer = setInterval(() => {
      void this.refresh();
    }, this.intervalMs);
    timer.unref?.();

    void this.refresh({ force: true });
  }

  private async refresh(options: { force?: boolean } = {}): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      const result = await this.service.refreshYoutubeVideoCatalog(options);
      if (result.ok === false) {
        this.logger.warn(`YouTube stats refresh skipped: ${result.value.message}`);
        return;
      }
      if (result.value > 0) {
        this.logger.info(`Refreshed cached YouTube stats for ${result.value} video${result.value === 1 ? "" : "s"}.`);
      }
    } finally {
      this.running = false;
    }
  }
}

export function CreateYoutubeVideoStatsRefreshScheduler(
  service: IOnDraftService,
  logger: ILoggingService,
  intervalMs = YOUTUBE_STATS_REFRESH_INTERVAL_MS,
): IYoutubeVideoStatsRefreshScheduler {
  return new YoutubeVideoStatsRefreshScheduler(service, logger, intervalMs);
}
