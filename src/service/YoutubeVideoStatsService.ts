import { Err, Ok, Result } from "../lib/result";
import { ArticleError, ArticleValidationError, UnknownArticleError } from "../repository/OnDraftRepository";

export type YoutubeVideoStats = {
  videoId: string;
  thumbnailUrl?: string;
  viewCount?: number;
};

export interface IYoutubeVideoStatsService {
  fetchVideoStats(videoIds: string[]): Promise<Result<Map<string, YoutubeVideoStats>, ArticleError>>;
}

type YoutubeVideosListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      thumbnails?: Record<string, { url?: string }>;
    };
    statistics?: {
      viewCount?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

class YoutubeVideoStatsService implements IYoutubeVideoStatsService {
  constructor(private readonly apiKey = process.env.YOUTUBE_API_KEY) {}

  async fetchVideoStats(videoIds: string[]): Promise<Result<Map<string, YoutubeVideoStats>, ArticleError>> {
    const uniqueVideoIds = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))];
    const stats = new Map<string, YoutubeVideoStats>();
    if (!this.apiKey || uniqueVideoIds.length === 0) {
      return Ok(stats);
    }

    for (let index = 0; index < uniqueVideoIds.length; index += 50) {
      const batch = uniqueVideoIds.slice(index, index + 50);
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "snippet,statistics");
      url.searchParams.set("id", batch.join(","));
      url.searchParams.set("key", this.apiKey);

      let response: Response;
      try {
        response = await fetch(url);
      } catch {
        return Err(UnknownArticleError("Unable to reach the YouTube Data API."));
      }

      let body: YoutubeVideosListResponse;
      try {
        body = await response.json() as YoutubeVideosListResponse;
      } catch {
        return Err(UnknownArticleError("Unable to read the YouTube Data API response."));
      }

      if (!response.ok) {
        return Err(ArticleValidationError(body.error?.message ?? "Unable to fetch YouTube video metadata."));
      }

      (body.items ?? []).forEach((item) => {
        if (!item.id) {
          return;
        }
        const thumbnails = item.snippet?.thumbnails ?? {};
        const thumbnailUrl = thumbnails.maxres?.url ?? thumbnails.standard?.url ?? thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url;
        const viewCount = item.statistics?.viewCount ? Number(item.statistics.viewCount) : undefined;
        stats.set(item.id, {
          videoId: item.id,
          thumbnailUrl,
          viewCount: Number.isFinite(viewCount) ? viewCount : undefined,
        });
      });
    }

    return Ok(stats);
  }
}

export function CreateYoutubeVideoStatsService(apiKey = process.env.YOUTUBE_API_KEY): IYoutubeVideoStatsService {
  return new YoutubeVideoStatsService(apiKey);
}
