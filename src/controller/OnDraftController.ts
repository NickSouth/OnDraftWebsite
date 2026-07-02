import type { Request, Response } from "express";
import type { IOnDraftBrowserSession } from "../session/OnDraftSession";
import { isAdminSession, isVerifiedUserSession } from "../session/OnDraftSession";
import type { AdminUserListItem, IAuthService } from "../auth/AuthService";
import type { BigBoardEditableEntryInput, ConsensusDiscrepancyWriteupInput, CreateArticleInput, CreateYoutubeVideoInput, IOnDraftService, NewsletterInput, SaveBigBoardEntriesInput, SiteSearchResults } from "../service/OnDraftService";
import type { IUserPreferenceService, UserPreferenceError } from "../service/UserPreferenceService";
import type { ILoggingService } from "../service/LoggingService";
import type { AnalyticsCategory, AnalyticsPeriod, IAnalyticsService } from "../service/UmamiAnalyticsService";
import { ArticleError, BigBoardError, ForumPostError } from "../repository/OnDraftRepository";
import { publicArticleUploadUrl } from "../uploads/articlePdfUpload";
import { BIG_BOARD_CREATORS, POSITIONS, type Article, type ArticleContent, type ArticleFilter, type BigBoard, type BigBoardCreator, type BigBoardEntry, type ForumPost, type ForumPostFilter, type Video, type VideoQuery } from "../model/OnDraftContent";
import {
  abbreviateDraftGradeTrait,
  calculateDraftGrade,
  defaultDraftGrade,
  effectiveDraftBoardGrade,
  draftGradeArchetypeNames,
  draftGradePositionConfig,
  formatDraftBoardGrade,
  gradeTraitCategoriesForGrade,
  normalizeDraftGradeOverride,
  normalizeDraftGradeTraitScore,
  normalizeDraftGradeValue,
  normalizePotential,
  validateDraftGradeForPublication,
  type DraftGrade,
} from "../model/DraftGrades";
import type { Bookmark, IUserBanRecord } from "../auth/User";
import { collegeTeam } from "../CollegeFootballColors";
import { helmetColorKey } from "../service/HelmetAssetService";

export interface DraftBoardFilterInput {
  school?: string;
  position?: string;
}

type HomeFeedItem =
  | {
      type: "article";
      id: string;
      title: string;
      description: string;
      href: string;
      author: string;
      date: Date;
      tags: string[];
      imageUrl?: string;
      likes: number;
      readMinutes: number | null;
    }
  | {
      type: "video";
      id: string;
      title: string;
      description: string;
      href: string;
      date: Date;
      tags: string[];
      imageUrl?: string;
      fallbackImageUrl?: string;
      viewCount?: number;
    };

const collegeTeamNames = Object.keys(collegeTeam).sort((first, second) => first.localeCompare(second));

type BigBoardEditorField =
  | "playerName"
  | "school"
  | "position"
  | "rank"
  | "posRank"
  | "height"
  | "weight"
  | "grade"
  | "strengths"
  | "weaknesses"
  | "rundown";

type BigBoardEditorValidationIssue = {
  entryId: string;
  field: BigBoardEditorField;
  message?: string;
};

export interface IOnDraftController {
  publicFeedItems(): Promise<Array<{ title: string; description: string; href: string; date: Date }>>;
  publicSitemapEntries(): Promise<Array<{ href: string; updatedAt?: Date }>>;
  showAdminDashboard(res: Response, session: IOnDraftBrowserSession, activeTab?: AdminDashboardTab, analyticsCategory?: AnalyticsCategory, analyticsPeriod?: AnalyticsPeriod): Promise<void>;
  showAdminDashboardTab(res: Response, session: IOnDraftBrowserSession, tab: AdminDashboardTab, category?: AnalyticsCategory, period?: AnalyticsPeriod): Promise<void>;
  showNewsletterDraftEditor(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  saveNewsletterDraft(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  sendNewsletter(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showHome(res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showPopularArticles(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showArticles(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showFilteredArticles(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showBookmarks(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showVideos(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showVideo(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showCreateVideoForm(res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showEditVideoForm(res: Response, session: IOnDraftBrowserSession, videoId: string): Promise<void>;
  showHotTakes(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showFilteredHotTakes(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showBigBoard(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showEditBigBoard(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showOneArticle(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void>;
  showCreateArticleForm(res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showEditArticleForm(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void>;
  showArticlePreview(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void>;
  showCreateBigBoardEntryForm(res: Response, session: IOnDraftBrowserSession): Promise<void>;
  previewArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  createArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  createYoutubeVideo(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  updateYoutubeVideo(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  deleteYoutubeVideo(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  updateArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  likeArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  toggleArticleBookmark(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  toggleForumPostBookmark(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showArticleComments(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  commentOnArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  commentReply(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  likeComment(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  deleteComment(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  createHotTake(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  likeHotTake(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  commentOnHotTake(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  deleteHotTakeComment(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  deleteHotTake(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  createBigBoardEntry(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  createBigBoardYear(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  deleteBigBoardYear(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  saveBigBoard(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  saveBigBoardEntry(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  autosaveBigBoard(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  publishBigBoardPlayerInfo(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  publishBigBoardGrade(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  publishBigBoardWriteup(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  saveConsensusDiscrepancyWriteup(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  publishConsensusDiscrepancyWriteup(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  deleteBigBoardEntryFromEditor(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  deleteArticle(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  deleteBigBoardEntry(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  getSavedSchools(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  setDefaultBigBoardYear(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  // v2.1 c8-search
  showSearch(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showSearchSuggest(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
}

export type AdminDashboardTab = "users" | "content" | "newsletter" | "analytics";

class OnDraftController implements IOnDraftController {
  constructor(
    private readonly service: IOnDraftService,
    private readonly userPreferences: IUserPreferenceService,
    private readonly logger: ILoggingService,
    private readonly authService: IAuthService,
    private readonly analytics?: IAnalyticsService,
  ) {}

  private mapArticleErrorToStatusCode(error: ArticleError): number {
    switch (error.name) {
      case "ArticleNotFound":
      case "CommentNotFound":
        return 404;
      case "DuplicateArticle":
        return 409;
      case "ArticleValidationError":
        return 400;
      case "DatabaseError":
        return 500;
      default:
        return 500;
    }
  }

  private mapBigBoardErrorToStatusCode(error: BigBoardError): number {
    switch (error.name) {
      case "BigBoardNotFound":
      case "PlayerNotFound":
        return 404;
      case "DuplicatePlayer":
      case "DuplicateBigBoardYear":
        return 409;
      case "BigBoardValidationError":
        return 400;
      case "DatabaseError":
        return 500;
      default:
        return 500;
    }
  }

  private mapForumPostErrorToStatusCode(error: ForumPostError): number {
    switch (error.name) {
      case "ForumPostNotFound":
      case "CommentNotFound":
        return 404;
      case "DuplicateForumPost":
        return 409;
      case "ForumPostValidationError":
        return 400;
      case "DatabaseError":
        return 500;
      default:
        return 500;
    }
  }

  private mapUserPreferenceErrorToStatusCode(error: UserPreferenceError): number {
    switch (error.name) {
      case "UserNotFound":
        return 404;
      case "DatabaseError":
      case "UnknownUserPreferenceError":
        return 500;
      default:
        return 500;
    }
  }

  private parseBigBoardCreator(value: unknown): BigBoardCreator | undefined {
    return typeof value === "string" && BIG_BOARD_CREATORS.includes(value as BigBoardCreator)
      ? value as BigBoardCreator
      : undefined;
  }

  private parseBigBoardYear(value: unknown): number | undefined {
    if (typeof value !== "string" || value.trim() === "") {
      return undefined;
    }
    const year = Number(value);
    return Number.isInteger(year) ? year : undefined;
  }

  private parseOptionalNumber(value: unknown): number | null {
    if (typeof value !== "string" && typeof value !== "number") {
      return null;
    }
    if (typeof value === "string" && value.trim() === "") {
      return null;
    }
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  private formString(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  private formStrings(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string");
    }
    return typeof value === "string" && value.trim() ? [value] : [];
  }

  private formBoolean(value: unknown): boolean {
    return value === "true" || value === "on";
  }

  private formRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private formTraitScores(value: unknown): Record<string, DraftGrade["physicalTraits"][string]> {
    return Object.fromEntries(
      Object.entries(this.formRecord(value)).map(([trait, score]) => [trait, normalizeDraftGradeTraitScore(score)])
    );
  }

  private buildDraftGradeInput(entry: Record<string, unknown>): DraftGrade | null {
    const rawGrade = this.formRecord(entry.grade);
    const position = this.formString(entry.position) || this.formString(rawGrade.position);
    const archetype = this.formString(rawGrade.archetype);
    const physicalTraits = this.formRecord(rawGrade.physicalTraits);
    const filmTraits = this.formRecord(rawGrade.filmTraits);

    if (!POSITIONS.includes(position as typeof POSITIONS[number])) {
      return null;
    }

    return {
      position: position as typeof POSITIONS[number],
      archetype: draftGradeArchetypeNames(position as typeof POSITIONS[number]).includes(archetype)
        ? archetype
        : draftGradeArchetypeNames(position as typeof POSITIONS[number])[0] ?? "",
      value: normalizeDraftGradeValue(rawGrade.value),
      potential: normalizePotential(rawGrade.potential),
      physicalTraits: this.formTraitScores(physicalTraits),
      filmTraits: this.formTraitScores(filmTraits),
      overrideDisplayGrade: normalizeDraftGradeOverride(rawGrade.overrideDisplayGrade),
    };
  }

  private parseHeightLabel(value: unknown): { feet: number; inches: number } | null {
    if (typeof value !== "string" || value.trim() === "") {
      return null;
    }
    const match = value.match(/^(\d+)-(\d+(?:\.\d+)?)$/);
    if (!match) {
      return null;
    }
    return {
      feet: Number(match[1]),
      inches: Number(match[2]),
    };
  }

  private formEntries(rawEntries: unknown): Record<string, unknown>[] {
    if (Array.isArray(rawEntries)) {
      return rawEntries.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
    }
    if (typeof rawEntries === "object" && rawEntries !== null) {
      return Object.keys(rawEntries)
        .sort((first, second) => Number(first) - Number(second))
        .map((key) => (rawEntries as Record<string, unknown>)[key])
        .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
    }
    return [];
  }

  private buildBigBoardEntriesInput(req: Request): SaveBigBoardEntriesInput {
    const entries: BigBoardEditableEntryInput[] = this.formEntries(req.body.entries).map((entry) => {
      const height = typeof entry.height === "object" && entry.height !== null
        ? entry.height as Record<string, unknown>
        : {};
      const heightFeet = this.parseOptionalNumber(height.feet);
      const heightInches = this.parseOptionalNumber(height.inches);
      const heightLabel = this.parseHeightLabel(entry.heightLabel);
      const hasField = (field: string) => Object.prototype.hasOwnProperty.call(entry, field);

      const input: BigBoardEditableEntryInput = {
        id: this.formString(entry.id),
        playerName: this.formString(entry.playerName),
        school: this.formString(entry.school),
        position: this.formString(entry.position),
        rank: this.parseOptionalNumber(entry.rank),
        posRank: this.parseOptionalNumber(entry.posRank),
        height: heightLabel ?? (heightFeet === null && heightInches === null ? null : { feet: heightFeet ?? 0, inches: heightInches ?? 0 }),
        weight: this.parseOptionalNumber(entry.weight),
        playerInfoPublished: this.formBoolean(entry.playerInfoPublished),
        gradePublished: this.formBoolean(entry.gradePublished),
        writeupPublished: this.formBoolean(entry.writeupPublished),
      };
      if (hasField("grade")) {
        input.grade = this.buildDraftGradeInput(entry);
      }
      if (hasField("strengths")) {
        input.strengths = this.formString(entry.strengths);
      }
      if (hasField("weaknesses")) {
        input.weaknesses = this.formString(entry.weaknesses);
      }
      if (hasField("rundown")) {
        input.rundown = this.formString(entry.rundown);
      }
      if (hasField("notes")) {
        input.notes = this.formString(entry.notes);
      }
      return input;
    }).filter((entry) => !this.isBlankBigBoardEntryInput(entry));

    return {
      year: this.parseBigBoardYear(req.body.year),
      creator: this.parseBigBoardCreator(req.body.creator),
      entries,
    };
  }

  private isBlankBigBoardEntryInput(entry: BigBoardEditableEntryInput): boolean {
    return (entry.playerName ?? "").trim() === ""
      && (entry.school ?? "").trim() === ""
      && (entry.position ?? "").trim() === ""
      && entry.rank === null
      && entry.posRank === null
      && entry.height === null
      && entry.weight === null
      && (entry.grade === null || entry.grade === undefined)
      && (entry.strengths ?? "").trim() === ""
      && (entry.weaknesses ?? "").trim() === ""
      && (entry.rundown ?? "").trim() === ""
      && (entry.notes ?? "").trim() === ""
      && !entry.playerInfoPublished
      && !entry.gradePublished
      && !entry.writeupPublished;
  }

  private bigBoardEditHref(board: BigBoard): string {
    return `/bigboard/edit?year=${board.year}&creator=${encodeURIComponent(board.creator)}`;
  }

  private articleUpload(req: Request, fieldName: "pdf" | "image"): Express.Multer.File | undefined {
    const files = req.files;
    if (!files || Array.isArray(files)) {
      return undefined;
    }

    return files[fieldName]?.[0];
  }

  private queryString(req: Request, key: string): string | undefined {
    const value = req.query[key];
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private queryDate(req: Request, key: string): Date | undefined {
    const value = this.queryString(req, key);
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }

  private articleStatus(req: Request, session: IOnDraftBrowserSession): boolean {
    if (!isAdminSession(session)) {
      return true;
    }

    return this.queryString(req, "status") === "draft" ? false : true;
  }

  private articleSortBy(req: Request): ArticleFilter["sortBy"] {
    const sortBy = this.queryString(req, "sortBy");
    return sortBy === "likes" || sortBy === "comments" ? sortBy : "date";
  }

  private articleSortDirection(req: Request): ArticleFilter["sortDirection"] {
    return this.queryString(req, "sortDirection") === "asc" ? "asc" : "desc";
  }

  private isLikelyMobileRequest(req: Request): boolean {
    const userAgent = req.get("user-agent") ?? "";
    return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(userAgent);
  }

  private articleViewMode(req: Request): "card" | "list" {
    const requestedView = this.queryString(req, "view");
    if (requestedView === "list" || requestedView === "card") {
      return requestedView;
    }
    return this.isLikelyMobileRequest(req) ? "list" : "card";
  }

  private hasArticleFilters(req: Request): boolean {
    return Boolean(
      this.queryString(req, "keyword") ||
      this.queryString(req, "author") ||
      this.queryString(req, "tags") ||
      this.queryString(req, "dateFrom") ||
      this.queryString(req, "dateTo")
    );
  }

  private hasVideoFilters(req: Request): boolean {
    return Boolean(
      this.queryString(req, "keyword") ||
      this.queryString(req, "tags") ||
      this.queryString(req, "dateFrom") ||
      this.queryString(req, "dateTo")
    );
  }

  private hasForumPostFilters(req: Request): boolean {
    return Boolean(
      this.queryString(req, "keyword") ||
      this.queryString(req, "dateFrom") ||
      this.queryString(req, "dateTo")
    );
  }

  private favoritesRange(req: Request): "all" | "month" | "year" {
    const range = this.queryString(req, "range");
    return range === "month" || range === "year" ? range : "all";
  }

  private favoritesDateRange(range: "all" | "month" | "year"): ArticleFilter["publicationDateRange"] | undefined {
    if (range === "all") {
      return undefined;
    }
    const now = new Date();
    const from = range === "month"
      ? new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      : new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    return { from, to: now };
  }

  private forumPostSortBy(req: Request): ForumPostFilter["sortBy"] {
    const sortBy = this.queryString(req, "sortBy");
    return sortBy === "likes" || sortBy === "comments" ? sortBy : "date";
  }

  private forumPostSortDirection(req: Request): ForumPostFilter["sortDirection"] {
    return this.queryString(req, "sortDirection") === "asc" ? "asc" : "desc";
  }

  private videoSortBy(req: Request): VideoQuery["sortBy"] {
    return this.queryString(req, "sortBy") === "popularity" ? "popularity" : "date";
  }

  private videoSortDirection(req: Request): VideoQuery["sortDirection"] {
    return this.queryString(req, "sortDirection") === "asc" ? "asc" : "desc";
  }

  private buildArticleFilter(req: Request, session: IOnDraftBrowserSession): ArticleFilter {
    const keyword = this.queryString(req, "keyword");
    const author = this.queryString(req, "author");
    const dateFrom = this.queryDate(req, "dateFrom");
    const dateTo = this.queryDate(req, "dateTo");
    const tags = this.queryString(req, "tags")
      ?.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const filter: ArticleFilter = {
      published: this.articleStatus(req, session),
      sortBy: this.articleSortBy(req),
      sortDirection: this.articleSortDirection(req),
    };
    if (keyword) {
      filter.keyword = keyword;
    }
    if (author) {
      filter.author = author;
    }
    if (tags && tags.length > 0) {
      filter.tags = tags;
    }
    if (dateFrom || dateTo) {
      filter.publicationDateRange = {
        from: dateFrom ?? new Date(0),
        to: dateTo ?? new Date(),
      };
    }

    return filter;
  }

  private buildForumPostFilter(req: Request): ForumPostFilter {
    const keyword = this.queryString(req, "keyword");
    const dateFrom = this.queryDate(req, "dateFrom");
    const dateTo = this.queryDate(req, "dateTo");

    const filter: ForumPostFilter = {
      sortBy: this.forumPostSortBy(req),
      sortDirection: this.forumPostSortDirection(req),
    };
    if (keyword) {
      filter.keyword = keyword;
    }
    if (dateFrom || dateTo) {
      filter.dateRange = {
        from: dateFrom ?? new Date(0),
        to: dateTo ?? new Date(),
      };
    }

    return filter;
  }

  private buildVideoQuery(req: Request): VideoQuery {
    const keyword = this.queryString(req, "keyword");
    const dateFrom = this.queryDate(req, "dateFrom");
    const dateTo = this.queryDate(req, "dateTo");
    const tags = this.queryString(req, "tags")
      ?.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const query: VideoQuery = {
      sortBy: this.videoSortBy(req),
      sortDirection: this.videoSortDirection(req),
    };
    if (keyword) {
      query.keyword = keyword;
    }
    if (tags && tags.length > 0) {
      query.tags = tags;
    }
    if (dateFrom || dateTo) {
      query.dateRange = {
        from: dateFrom ?? new Date(0),
        to: dateTo ?? new Date(),
      };
    }
    return query;
  }

  private articleHomeItem(article: Article): HomeFeedItem {
    return {
      type: "article",
      id: article.id,
      title: article.title,
      description: article.writeup,
      href: `/articles/${article.id}`,
      author: article.author,
      date: article.publicationDate,
      tags: article.tags ?? [],
      imageUrl: article.imageUrl,
      likes: article.likes,
      readMinutes: this.service.articleReadMinutes(article),
    };
  }

  private videoHomeItem(video: Video): HomeFeedItem {
    const fallbackImageUrl = `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`;
    return {
      type: "video",
      id: video.videoId,
      title: video.title,
      description: video.description,
      href: video.youtubeUrl,
      date: video.createdAt,
      tags: video.tags,
      imageUrl: video.thumbnailUrl || fallbackImageUrl,
      fallbackImageUrl: video.thumbnailUrl && video.thumbnailUrl !== fallbackImageUrl ? fallbackImageUrl : undefined,
      viewCount: video.viewCount,
    };
  }

  private homeFeedItems(articles: Article[], videos: Video[]): HomeFeedItem[] {
    return [
      ...articles.map((article) => this.articleHomeItem(article)),
      ...videos.map((video) => this.videoHomeItem(video)),
    ].sort((first, second) => second.date.getTime() - first.date.getTime());
  }

  private metadataDescription(value: string, fallback: string): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    const description = normalized || fallback;
    return description.length > 160 ? `${description.slice(0, 157).trimEnd()}...` : description;
  }

  private jsonLd(value: unknown): string {
    return JSON.stringify(value).replace(/</g, "\\u003c");
  }

  private organizationStructuredData(res: Response) {
    return {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "OnDraft Football",
      url: this.absoluteMetadataUrl(res, "/"),
      logo: this.absoluteMetadataUrl(res, "/images/brand/OnDraftLogo-cropped.png"),
      sameAs: [
        "https://www.youtube.com/channel/UCX7Py3t2L1pUYF6JxzzP4fA",
        "https://x.com/OnDraftFootball",
        "https://www.tiktok.com/@ondraftfootball",
      ],
    };
  }

  private websiteStructuredData(res: Response) {
    return {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "OnDraft Football",
      url: this.absoluteMetadataUrl(res, "/"),
      description: "NFL and NFL Draft analysis, opinions, videos, community hot takes, and draft boards from OnDraft Football.",
      publisher: {
        "@type": "Organization",
        name: "OnDraft Football",
      },
    };
  }

  private articleStructuredData(res: Response, article: Article) {
    const articleUrl = this.absoluteMetadataUrl(res, `/articles/${article.id}`);
    const imageUrl = this.absoluteMetadataUrl(res, article.imageUrl ?? "/images/brand/OnDraftLogo-cropped.png");
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: this.metadataDescription(article.writeup, `Read ${article.title} on OnDraft Football.`),
      image: [imageUrl],
      datePublished: new Date(article.publicationDate).toISOString(),
      dateModified: new Date(article.publicationDate).toISOString(),
      author: {
        "@type": "Person",
        name: article.author,
      },
      publisher: {
        "@type": "Organization",
        name: "OnDraft Football",
        logo: {
          "@type": "ImageObject",
          url: this.absoluteMetadataUrl(res, "/images/brand/OnDraftLogo-cropped.png"),
        },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": articleUrl,
      },
      keywords: (article.tags ?? []).join(", "),
    };
  }

  private parseArticleTags(rawTags: unknown): string[] {
    if (typeof rawTags !== "string") {
      return [];
    }

    return rawTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  private routeParam(req: Request, key: string): string {
    const value = req.params[key];
    return Array.isArray(value) ? value[0] : value;
  }

  private commentLimit(req: Request): number {
    const rawLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;
    if (!Number.isFinite(rawLimit)) {
      return 10;
    }

    return Math.max(10, Math.min(100, Math.floor(rawLimit)));
  }

  private findCommentById(comments: Article["comments"], commentId: string): Article["comments"][number] | undefined {
    for (const comment of comments) {
      if (comment.id === commentId) {
        return comment;
      }

      const reply = this.findCommentById(comment.replies, commentId);
      if (reply) {
        return reply;
      }
    }

    return undefined;
  }

  private canDeleteForumPost(post: ForumPost, session: IOnDraftBrowserSession): boolean {
    return isAdminSession(session) || post.userId === session.authenticatedUser?.userId;
  }

  private likeActorId(session: IOnDraftBrowserSession): string {
    return session.authenticatedUser?.userId ?? session.browserId;
  }

  private async bookmarkedArticleIds(session: IOnDraftBrowserSession): Promise<string[]> {
    const userId = session.authenticatedUser?.userId;
    if (!userId) {
      return [];
    }

    const result = await this.userPreferences.getUserBookmarks(userId);
    if (result.ok === false) {
      this.logger.warn(`Unable to load article bookmarks: ${result.value.message}`);
      return [];
    }

    return result.value
      .filter((bookmark): bookmark is Extract<Bookmark, { type: "article" }> => bookmark.type === "article")
      .map((bookmark) => bookmark.articleId);
  }

  private async bookmarkedForumPostIds(session: IOnDraftBrowserSession): Promise<string[]> {
    const userId = session.authenticatedUser?.userId;
    if (!userId) {
      return [];
    }

    const result = await this.userPreferences.getUserBookmarks(userId);
    if (result.ok === false) {
      this.logger.warn(`Unable to load forum post bookmarks: ${result.value.message}`);
      return [];
    }

    return result.value
      .filter((bookmark): bookmark is Extract<Bookmark, { type: "forumPost" }> => bookmark.type === "forumPost")
      .map((bookmark) => bookmark.forumPostId);
  }

  private async userModerationById(session: IOnDraftBrowserSession): Promise<Map<string, AdminUserListItem>> {
    if (!isAdminSession(session)) {
      return new Map();
    }

    const result = await this.authService.listAdminUsers();
    if (result.ok === false) {
      this.logger.warn(`Unable to load user moderation state: ${result.value.message}`);
      return new Map();
    }

    return new Map(result.value.map((user) => [user.id, user]));
  }

  private async userDirectoryById(): Promise<Map<string, AdminUserListItem>> {
    const result = await this.authService.listAdminUsers();
    if (result.ok === false) {
      this.logger.warn(`Unable to load user directory: ${result.value.message}`);
      return new Map();
    }

    return new Map(result.value.map((user) => [user.id, user]));
  }

  private async activeUserBan(session: IOnDraftBrowserSession): Promise<IUserBanRecord | null> {
    const userId = session.authenticatedUser?.userId;
    if (!userId || isAdminSession(session)) {
      return null;
    }

    const result = await this.authService.getActiveUserBan({ userId });
    if (result.ok === false) {
      this.logger.warn(`Unable to load active user ban: ${result.value.message}`);
      return null;
    }

    return result.value;
  }

  private renderBanResponse(res: Response, ban: IUserBanRecord): void {
    res.status(403).render("ondraft/partials/bannedUserNotice", {
      layout: false,
      ban,
    });
  }

  private requireAuthenticatedUser(res: Response, session: IOnDraftBrowserSession): string | null {
    const userId = session.authenticatedUser?.userId;
    if (userId) {
      return userId;
    }

    res.status(401).send("Log in to bookmark OnDraft content.");
    return null;
  }

  private renderBookmarkButton(res: Response, bookmark: Bookmark, bookmarked: boolean): void {
    res.render("ondraft/partials/bookmarkButton", {
      layout: false,
      bookmark,
      bookmarked,
    });
  }

  private async renderArticleCommentError(req: Request, res: Response, session: IOnDraftBrowserSession, message: string, statusCode = 403): Promise<void> {
    const articleId = this.routeParam(req, "id");
    const articleResult = await this.service.getArticle(articleId);
    if (articleResult.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(articleResult.value)).send(articleResult.value.message);
      return;
    }

    res.status(statusCode).render("ondraft/partials/articleComments", {
      layout: false,
      article: articleResult.value,
      session,
      isAdmin: isAdminSession(session),
      commentsLimit: this.commentLimit(req),
      likeActorId: this.likeActorId(session),
      errorMessage: message,
      userDirectoryById: await this.userDirectoryById(),
      userModerationById: await this.userModerationById(session),
      activeUserBan: await this.activeUserBan(session),
    });
  }

  private async renderHotTakeCommentError(req: Request, res: Response, session: IOnDraftBrowserSession, message: string, statusCode = 403): Promise<void> {
    const postId = this.routeParam(req, "id");
    const postResult = await this.service.getForumPost(postId);
    if (postResult.ok === false) {
      res.status(this.mapForumPostErrorToStatusCode(postResult.value)).send(postResult.value.message);
      return;
    }

    res.status(statusCode).render("ondraft/partials/hotTakeComments", {
      layout: false,
      post: postResult.value,
      session,
      isAdmin: isAdminSession(session),
      errorMessage: message,
      userDirectoryById: await this.userDirectoryById(),
      userModerationById: await this.userModerationById(session),
      activeUserBan: await this.activeUserBan(session),
    });
  }

  private async getArticleTagSuggestions(): Promise<string[]> {
    const articleTags = await this.service.getArticleTags();
    if (articleTags.ok === true) {
      return [...articleTags.value].sort((first, second) => first.localeCompare(second));
    }

    return [];
  }

  async publicFeedItems(): Promise<Array<{ title: string; description: string; href: string; date: Date }>> {
    const articlesResult = await this.service.getArticles(true);
    const videosResult = await this.service.getYoutubeVideos();
    const articles = articlesResult.ok === true ? articlesResult.value : [];
    const videos = videosResult.ok === true ? videosResult.value : [];
    return this.homeFeedItems(articles, videos).slice(0, 20).map((item) => ({
      title: item.title,
      description: item.description,
      href: item.href,
      date: item.date,
    }));
  }

  private canCreateHotTake(session: IOnDraftBrowserSession, activeBan: IUserBanRecord | null): boolean {
    return Boolean(session.authenticatedUser?.emailVerifiedAt && !activeBan);
  }

  private async getVideoTagSuggestions(): Promise<string[]> {
    const videoTags = await this.service.getVideoTags();
    if (videoTags.ok === true) {
      return [...videoTags.value].sort((first, second) => first.localeCompare(second));
    }

    return [];
  }

  async publicSitemapEntries(): Promise<Array<{ href: string; updatedAt?: Date }>> {
    const articlesResult = await this.service.getArticles(true);
    if (articlesResult.ok === false) {
      this.logger.warn(`Unable to load sitemap articles: ${articlesResult.value.message}`);
      return [];
    }

    return articlesResult.value.map((article) => ({
      href: `/articles/${article.id}`,
      updatedAt: article.publicationDate,
    }));
  }

  private adminDashboardTabs(activeTab: AdminDashboardTab) {
    return [
      { id: "users", label: "Manage Users", href: "/admin/tabs/users" },
      { id: "content", label: "Create Content", href: "/admin/tabs/content" },
      { id: "newsletter", label: "Newsletter", href: "/admin/tabs/newsletter" },
      { id: "analytics", label: "Analytics", href: "/admin/tabs/analytics" },
    ].map((tab) => ({ ...tab, active: tab.id === activeTab }));
  }

  async showAdminDashboard(
    res: Response,
    session: IOnDraftBrowserSession,
    activeTab: AdminDashboardTab = "users",
    analyticsCategory: AnalyticsCategory = "all",
    analyticsPeriod: AnalyticsPeriod = "month",
  ): Promise<void> {
    res.render("ondraft/adminDashboard", {
      session,
      isAdmin: isAdminSession(session),
      activeTab,
      analyticsCategory,
      analyticsPeriod,
      tabs: this.adminDashboardTabs(activeTab),
    });
  }

  async showAdminDashboardTab(res: Response, _session: IOnDraftBrowserSession, tab: AdminDashboardTab, category: AnalyticsCategory = "all", period: AnalyticsPeriod = "month"): Promise<void> {
    if (tab === "content") {
      res.render("ondraft/partials/adminCreateContent", { layout: false });
      return;
    }

    if (tab === "newsletter") {
      await this.renderAdminNewsletter(res);
      return;
    }

    await this.renderAdminAnalytics(res, category, period);
  }

  private async renderAdminAnalytics(res: Response, category: AnalyticsCategory = "all", period: AnalyticsPeriod = "month"): Promise<void> {
    const summary = this.analytics ? await this.analytics.getSummary(category, period) : null;
    res.render("ondraft/partials/adminAnalytics", {
      layout: false,
      category,
      period,
      summary: summary?.ok === true ? summary.value : null,
      diagnostics: summary?.ok === false ? summary.value : null,
      errorMessage: summary?.ok === false ? summary.value.message : null,
    });
  }

  private parseNewsletterDate(value: unknown): Date | undefined {
    const raw = this.formString(value);
    if (!raw) {
      return undefined;
    }
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return new Date(raw);
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  }

  private buildNewsletterInput(req: Request): NewsletterInput {
    return {
      id: this.formString(req.body.id) || undefined,
      date: this.parseNewsletterDate(req.body.date),
      writeup: this.formString(req.body.writeup),
      articleIds: this.formStrings(req.body.articleIds),
      videoIds: this.formStrings(req.body.videoIds),
      changelog: this.formString(req.body.changelog),
    };
  }

  private async renderAdminNewsletter(
    res: Response,
    options: { flashMessage?: string | null; errorMessage?: string | null; values?: Partial<NewsletterInput> } = {},
  ): Promise<void> {
    const articlesResult = await this.service.getFilteredArticles({ published: true, sortBy: "date", sortDirection: "desc" });
    const videosResult = await this.service.filterYoutubeVideos({ sortBy: "date", sortDirection: "desc" });
    const newslettersResult = await this.service.listNewsletters();
    res.render("ondraft/partials/adminNewsletter", {
      layout: false,
      articles: articlesResult.ok === true ? articlesResult.value.slice(0, 30) : [],
      videos: videosResult.ok === true ? videosResult.value.slice(0, 30) : [],
      newsletters: newslettersResult.ok === true ? newslettersResult.value.slice(0, 6) : [],
      flashMessage: options.flashMessage ?? null,
      errorMessage: options.errorMessage ?? null,
      values: options.values ?? {},
    });
  }

  async showNewsletterDraftEditor(req: Request, res: Response, _session: IOnDraftBrowserSession): Promise<void> {
    const newsletterId = this.formString(req.params.id);
    const newsletter = await this.service.getNewsletter(newsletterId);
    if (newsletter.ok === false || newsletter.value.status !== "draft") {
      res.status(404);
      await this.renderAdminNewsletter(res, { errorMessage: "Newsletter draft not found." });
      return;
    }

    await this.renderAdminNewsletter(res, { values: newsletter.value });
  }

  async saveNewsletterDraft(req: Request, res: Response, _session: IOnDraftBrowserSession): Promise<void> {
    const input = this.buildNewsletterInput(req);
    const result = await this.service.saveNewsletterDraft(input);
    if (result.ok === false) {
      res.status(400);
      await this.renderAdminNewsletter(res, { errorMessage: result.value.message, values: input });
      return;
    }

    await this.renderAdminNewsletter(res, {
      flashMessage: "Newsletter draft saved.",
    });
  }

  async sendNewsletter(req: Request, res: Response, _session: IOnDraftBrowserSession): Promise<void> {
    const input = this.buildNewsletterInput(req);
    const recipients = await this.authService.listNewsletterRecipients();
    if (recipients.ok === false) {
      res.status(500);
      await this.renderAdminNewsletter(res, { errorMessage: "Unable to load newsletter recipients.", values: input });
      return;
    }

    const result = await this.service.sendNewsletter(input, recipients.value);
    if (result.ok === false) {
      res.status(400);
      await this.renderAdminNewsletter(res, { errorMessage: result.value.message, values: input });
      return;
    }

    await this.renderAdminNewsletter(res, {
      flashMessage: `Newsletter sent to ${result.value.recipientCount} subscriber${result.value.recipientCount === 1 ? "" : "s"}.`,
    });
  }

  private buildArticleContent(req: Request): ArticleContent {
    const contentType = req.body.contentType === "pdf" || req.body.contentType === "html"
      ? req.body.contentType
      : "plainText";
    const uploadedPdf = this.articleUpload(req, "pdf");

    if (contentType === "pdf") {
      return uploadedPdf
        ? {
            type: "pdf" as const,
            url: publicArticleUploadUrl(uploadedPdf.filename),
            originalName: uploadedPdf.originalname,
            mimeType: "application/pdf" as const,
            size: uploadedPdf.size,
          }
        : {
            type: "pdf" as const,
            url: typeof req.body.pdfUrl === "string" ? req.body.pdfUrl : "",
            originalName: typeof req.body.pdfOriginalName === "string" ? req.body.pdfOriginalName : "",
            mimeType: "application/pdf" as const,
            size: Number(req.body.pdfSize ?? 0),
          };
    }

    if (contentType === "html") {
      return {
        type: "html" as const,
        body: req.body.content,
      };
    }

    return {
      type: "plainText" as const,
      text: req.body.content,
    };
  }

  private buildArticleInput(req: Request, published: boolean): CreateArticleInput {
    const uploadedImage = this.articleUpload(req, "image");
    const publicationDate = this.parseLocalDate(req.body.publicationDate);

    return {
      title: req.body.title,
      author: req.body.author,
      writeup: req.body.writeup,
      tags: this.parseArticleTags(req.body.tags),
      published,
      publicationDate,
      content: this.buildArticleContent(req),
      imageUrl: uploadedImage
        ? publicArticleUploadUrl(uploadedImage.filename)
        : typeof req.body.imageUrl === "string" && req.body.imageUrl
          ? req.body.imageUrl
          : undefined,
    };
  }

  private async popularArticles(range: "all" | "month" | "year"): Promise<Array<Article & { readMinutes: number | null }>> {
    const result = await this.service.getFilteredArticles({
      published: true,
      sortBy: "likes",
      sortDirection: "desc",
      publicationDateRange: this.favoritesDateRange(range),
    });
    if (result.ok === false) {
      this.logger.warn(`Unable to load popular articles: ${result.value.message}`);
      return [];
    }
    return this.withReadMinutes(result.value
      .sort((first, second) => second.likes - first.likes || second.publicationDate.getTime() - first.publicationDate.getTime())
      .slice(0, 10));
  }

  private parseLocalDate(value: unknown): Date {
    if (typeof value !== "string") {
      return new Date("");
    }
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return new Date(value);
    }
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), 12);
  }

  private buildYoutubeVideoInput(req: Request): CreateYoutubeVideoInput {
    return {
      youtubeUrl: req.body.youtubeUrl,
      title: req.body.title,
      description: req.body.description,
      tags: this.parseArticleTags(req.body.tags),
    };
  }

  private videoFormValues(video: Video): Record<string, string> {
    return {
      youtubeUrl: video.youtubeUrl,
      title: video.title,
      description: video.description,
      tags: video.tags.join(","),
    };
  }

  async showHome(res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering ondraft home page");
    const articlesResult = await this.service.getFilteredArticles({ published: true, sortBy: "date", sortDirection: "desc" });
    const videosResult = await this.service.getYoutubeVideos();

    if (articlesResult.ok === false) {
      this.logger.warn(`Unable to load homepage articles: ${articlesResult.value.message}`);
    }
    if (videosResult.ok === false) {
      this.logger.warn(`Unable to load homepage videos: ${videosResult.value.message}`);
    }

    const articles = articlesResult.ok === true ? articlesResult.value : [];
    const videos = videosResult.ok === true ? videosResult.value : [];
    const latestItems = this.homeFeedItems(articles, videos).slice(0, 5);
    const popularArticles = await this.popularArticles("all");

    const [playersScoutedResult, articlesWrittenResult, hotTakesPostedResult] = await Promise.all([
      this.service.countDistinctBigBoardPlayers(),
      this.service.countPublishedArticles(),
      this.service.countForumPosts(),
    ]);
    if (playersScoutedResult.ok === false) {
      this.logger.warn(`Unable to load players scouted count: ${playersScoutedResult.value.message}`);
    }
    if (articlesWrittenResult.ok === false) {
      this.logger.warn(`Unable to load article count: ${articlesWrittenResult.value.message}`);
    }
    if (hotTakesPostedResult.ok === false) {
      this.logger.warn(`Unable to load hot takes count: ${hotTakesPostedResult.value.message}`);
    }
    const heroStats = {
      playersScouted: playersScoutedResult.ok === true ? playersScoutedResult.value : 0,
      articlesWritten: articlesWrittenResult.ok === true ? articlesWrittenResult.value : 0,
      hotTakesPosted: hotTakesPostedResult.ok === true ? hotTakesPostedResult.value : 0,
    };

    res.render("ondraft/index", {
      session,
      isAdmin: isAdminSession(session),
      latestItems,
      heroStats,
      popularArticles,
      popularRange: "all",
      metaTitle: "OnDraft Football | NFL Draft Analysis, Articles, Videos, and Draft Boards",
      metaDescription: "A collection of NFL and NFL Draft analysis, opinions, predictions, videos, draft boards, and community football discussion from OnDraft Football.",
      metaKeywords: ["OnDraft Football", "NFL Draft analysis", "NFL analysis", "NFL Draft predictions", "football scouting", "draft board", "NFL videos"],
      structuredDataJson: this.jsonLd([this.organizationStructuredData(res), this.websiteStructuredData(res)]),
    });
  }

  async showPopularArticles(req: Request, res: Response, _session: IOnDraftBrowserSession): Promise<void> {
    const popularRange = this.favoritesRange(req);
    res.render("ondraft/partials/popularArticlesResultsBody", {
      layout: false,
      popularArticles: await this.popularArticles(popularRange),
    });
  }

  async showArticles(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering articles page");
    const showingPublished = this.articleStatus(req, session);
    const result = await this.service.getFilteredArticles(this.buildArticleFilter(req, session));
    if (result.ok === false) {
      this.logger.error("Failed to load articles" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    const hasFilters = this.hasArticleFilters(req);
    const unfilteredResult = hasFilters
      ? await this.service.getFilteredArticles({ published: showingPublished, sortBy: "date", sortDirection: "desc" })
      : result;
    const hasAnyArticles = unfilteredResult.ok === true ? unfilteredResult.value.length > 0 : result.value.length > 0;
    res.render("ondraft/articles", {
      session,
      isAdmin: isAdminSession(session),
      articles: this.withReadMinutes(result.value),
      showingPublished,
      sortBy: this.articleSortBy(req),
      sortDirection: this.articleSortDirection(req),
      viewMode: this.articleViewMode(req),
      articleTags: await this.getArticleTagSuggestions(),
      values: {
        keyword: this.queryString(req, "keyword") ?? "",
        author: this.queryString(req, "author") ?? "",
        tags: this.queryString(req, "tags") ?? "",
        dateFrom: this.queryString(req, "dateFrom") ?? "",
        dateTo: this.queryString(req, "dateTo") ?? "",
      },
      bookmarkedArticleIds: await this.bookmarkedArticleIds(session),
      hasAnyArticles,
      hasFilters,
      metaTitle: "Articles | OnDraft Football",
      metaDescription: "Read OnDraft Football articles with NFL analysis, NFL Draft opinions, scouting notes, predictions, and football discussion from our team.",
      metaKeywords: ["OnDraft articles", "NFL Draft articles", "NFL analysis articles", "football scouting articles", "draft analysis"],
    });
  }

  async showVideos(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering videos page");
    const query = this.buildVideoQuery(req);
    const result = await this.service.filterYoutubeVideos(query);
    if (result.ok === false) {
      this.logger.error("Failed to load videos" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    const hasFilters = this.hasVideoFilters(req);
    const unfilteredResult = hasFilters
      ? await this.service.filterYoutubeVideos({ sortBy: "date", sortDirection: "desc" })
      : result;
    const hasAnyVideos = unfilteredResult.ok === true ? unfilteredResult.value.length > 0 : result.value.length > 0;
    res.render("ondraft/videos", {
      session,
      isAdmin: isAdminSession(session),
      videos: result.value,
      videoTags: await this.getVideoTagSuggestions(),
      values: {
        keyword: this.queryString(req, "keyword") ?? "",
        tags: this.queryString(req, "tags") ?? "",
        dateFrom: this.queryString(req, "dateFrom") ?? "",
        dateTo: this.queryString(req, "dateTo") ?? "",
        sortBy: this.videoSortBy(req),
        sortDirection: this.videoSortDirection(req),
      },
      hasAnyVideos,
      hasFilters,
      metaTitle: "Video Library | OnDraft Football",
      metaDescription: "Watch OnDraft Football videos featuring breakdowns and discussions on NFL topics, NFL Draft prospects, scouting, and football analysis.",
      metaKeywords: ["OnDraft videos", "NFL Draft videos", "NFL analysis videos", "football breakdowns", "NFL Draft prospects"],
    });
  }

  async showVideo(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const videoId = this.routeParam(req, "videoId");
    const result = await this.service.getYoutubeVideo(videoId);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("ondraft/notFound", {
        session,
        isAdmin: isAdminSession(session),
        title: "Video not found",
        message: "That Bar TV pour has gone missing.",
        backHref: "/videos",
        backLabel: "Back to Bar TV",
      });
      return;
    }

    res.redirect(result.value.youtubeUrl);
  }

  private articleFormValues(article: Article): Record<string, string> {
    return {
      title: article.title,
      author: article.author,
      publicationDate: new Date(article.publicationDate).toISOString().slice(0, 10),
      writeup: article.writeup,
      tags: (article.tags ?? []).join(","),
      contentType: article.content.type === "plainText" ? "plainText" : article.content.type,
      content: article.content.type === "plainText"
        ? article.content.text
        : article.content.type === "html"
          ? article.content.body
          : "",
      imageUrl: article.imageUrl ?? "",
      pdfUrl: article.content.type === "pdf" ? article.content.url : "",
      pdfOriginalName: article.content.type === "pdf" ? article.content.originalName : "",
      pdfSize: article.content.type === "pdf" ? String(article.content.size) : "",
    };
  }

  private renderArticlePreview(res: Response, session: IOnDraftBrowserSession, article: Article): void {
    res.render("ondraft/articlePreview", {
      session,
      isAdmin: isAdminSession(session),
      article,
      readMinutes: this.service.articleReadMinutes(article),
      likeActorId: this.likeActorId(session),
      values: this.articleFormValues(article),
      formAction: article.id === "preview" ? "/articles" : `/articles/${article.id}`,
      editHref: article.id === "preview" ? "/articles/new" : `/articles/${article.id}/edit`,
    });
  }

  async showFilteredArticles(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering filtered articles");
    const showingPublished = this.articleStatus(req, session);
    const result = await this.service.getFilteredArticles(this.buildArticleFilter(req, session));
    if (result.ok === false) {
      this.logger.error("Failed to filter articles" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    const hasFilters = this.hasArticleFilters(req);
    const unfilteredResult = hasFilters
      ? await this.service.getFilteredArticles({ published: showingPublished, sortBy: "date", sortDirection: "desc" })
      : result;
    res.render("ondraft/partials/articleList", {
      layout: false,
      articles: this.withReadMinutes(result.value),
      showingPublished,
      isAdmin: isAdminSession(session),
      session,
      viewMode: this.articleViewMode(req),
      bookmarkedArticleIds: await this.bookmarkedArticleIds(session),
      hasAnyArticles: unfilteredResult.ok === true ? unfilteredResult.value.length > 0 : result.value.length > 0,
      hasFilters,
    });
  }

  async showBookmarks(_req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering bookmarks page");
    const userId = session.authenticatedUser?.userId;
    if (!userId) {
      res.render("ondraft/bookmarks", {
        session,
        isAdmin: isAdminSession(session),
        requireLogin: true,
        bookmarkedArticles: [],
        bookmarkedForumPosts: [],
      });
      return;
    }

    const bookmarksResult = await this.userPreferences.getUserBookmarks(userId);
    if (bookmarksResult.ok === false) {
      res.status(this.mapUserPreferenceErrorToStatusCode(bookmarksResult.value)).send(bookmarksResult.value.message);
      return;
    }

    const bookmarkedArticles: Article[] = [];
    const bookmarkedForumPosts: ForumPost[] = [];
    for (const bookmark of bookmarksResult.value) {
      if (bookmark.type === "article") {
        const article = await this.service.getArticle(bookmark.articleId);
        if (article.ok === true && article.value.published) {
          bookmarkedArticles.push(article.value);
        }
      } else {
        const post = await this.service.getForumPost(bookmark.forumPostId);
        if (post.ok === true) {
          bookmarkedForumPosts.push(post.value);
        }
      }
    }

    res.render("ondraft/bookmarks", {
      session,
      isAdmin: isAdminSession(session),
      requireLogin: false,
      bookmarkedArticles: this.withReadMinutes(bookmarkedArticles),
      bookmarkedForumPosts,
    });
  }

  private async renderHotTakeList(res: Response, posts: ForumPost[], session: IOnDraftBrowserSession, errorMessage: string | null = null): Promise<void> {
    const activeBan = await this.activeUserBan(session);
    res.render("ondraft/partials/hotTakeList", {
      layout: false,
      posts,
      session,
      isAdmin: isAdminSession(session),
      likeActorId: this.likeActorId(session),
      bookmarkedForumPostIds: await this.bookmarkedForumPostIds(session),
      userDirectoryById: await this.userDirectoryById(),
      userModerationById: await this.userModerationById(session),
      activeUserBan: activeBan,
      canCreateHotTake: this.canCreateHotTake(session, activeBan),
      errorMessage,
    });
  }

  async showHotTakes(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering hot takes page");
    const result = await this.service.getFilteredForumPosts(this.buildForumPostFilter(req));
    if (result.ok === false) {
      this.logger.error("Failed to load hot takes" + { error: result.value });
      res.status(this.mapForumPostErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    const activeBan = await this.activeUserBan(session);
    const hasFilters = this.hasForumPostFilters(req);
    const unfilteredResult = hasFilters
      ? await this.service.getFilteredForumPosts({ sortBy: "date", sortDirection: "desc" })
      : result;
    res.render("ondraft/hotTakes", {
      session,
      isAdmin: isAdminSession(session),
      posts: result.value,
      sortBy: this.forumPostSortBy(req),
      sortDirection: this.forumPostSortDirection(req),
      likeActorId: this.likeActorId(session),
      bookmarkedForumPostIds: await this.bookmarkedForumPostIds(session),
      userDirectoryById: await this.userDirectoryById(),
      userModerationById: await this.userModerationById(session),
      activeUserBan: activeBan,
      canCreateHotTake: this.canCreateHotTake(session, activeBan),
      hasAnyHotTakes: unfilteredResult.ok === true ? unfilteredResult.value.length > 0 : result.value.length > 0,
      hasFilters,
      errorMessage: null,
      values: {
        keyword: this.queryString(req, "keyword") ?? "",
      },
    });
  }

  async showFilteredHotTakes(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering filtered hot takes");
    const result = await this.service.getFilteredForumPosts(this.buildForumPostFilter(req));
    if (result.ok === false) {
      res.status(this.mapForumPostErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    const hasFilters = this.hasForumPostFilters(req);
    const unfilteredResult = hasFilters
      ? await this.service.getFilteredForumPosts({ sortBy: "date", sortDirection: "desc" })
      : result;
    const activeBan = await this.activeUserBan(session);
    res.render("ondraft/partials/hotTakeList", {
      layout: false,
      posts: result.value,
      session,
      isAdmin: isAdminSession(session),
      likeActorId: this.likeActorId(session),
      bookmarkedForumPostIds: await this.bookmarkedForumPostIds(session),
      userDirectoryById: await this.userDirectoryById(),
      userModerationById: await this.userModerationById(session),
      activeUserBan: activeBan,
      canCreateHotTake: this.canCreateHotTake(session, activeBan),
      hasAnyHotTakes: unfilteredResult.ok === true ? unfilteredResult.value.length > 0 : result.value.length > 0,
      hasFilters,
      errorMessage: null,
    });
  }

  async getSavedSchools(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const year = this.parseBigBoardYear(req.query.year);
    if (!year) {
      res.status(400).send("Invalid or missing year parameter.");
      return;
    }
    const result = await this.service.getSavedSchools(year);
    if (result.ok === false) {
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.json(result.value);
  }

  private buildBigBoardFilter(req: Request): DraftBoardFilterInput | undefined {
    const school = this.queryString(req, "school");
    const position = this.queryString(req, "position");
    if (!school && !position) {
      return undefined;
    }
    const filter: DraftBoardFilterInput = {};
    if (school) {
      filter.school = school;
    }
    if (position) {
      filter.position = position;
    }
    return filter;
  }

  private publishedBoardGrade(entry: BigBoardEntry): number | null {
    if (!entry.gradePublished) {
      return null;
    }
    return entry.gradeSummary?.finalGrade ?? effectiveDraftBoardGrade(entry.grade);
  }

  async showBigBoard(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering big board page");
    const parsedYear = this.parseBigBoardYear(req.query.year);
    const selectedYear = parsedYear ?? await this.service.resolveDefaultBigBoardYear();
    const selectedCreator = this.parseBigBoardCreator(req.query.creator);
    const filter = this.buildBigBoardFilter(req);
    const result = await this.service.getBigBoard(selectedYear, selectedCreator, filter);
    if (result.ok === false) {
      this.logger.error("Failed to load big board" + { error: result.value });
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    const yearsResult = await this.service.getBigBoardYears();
    if (yearsResult.ok === false) {
      this.logger.error("Failed to load big board years" + { error: yearsResult.value });
      res.status(this.mapBigBoardErrorToStatusCode(yearsResult.value)).send(yearsResult.value.message);
      return;
    }
    let schools: string[] = [];
    if (result.value.creator === "Consensus") {
      const unfilteredConsensus = await this.service.getBigBoard(result.value.year, result.value.creator);
      if (unfilteredConsensus.ok === false) {
        this.logger.error("Failed to load consensus big board schools" + { error: unfilteredConsensus.value });
        res.status(this.mapBigBoardErrorToStatusCode(unfilteredConsensus.value)).send(unfilteredConsensus.value.message);
        return;
      }
      schools = [...new Set(unfilteredConsensus.value.entries
        .filter((entry) => entry.playerInfoPublished)
        .map((entry) => entry.school)
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    } else {
      const schoolsResult = await this.service.getSavedSchools(result.value.year);
      if (schoolsResult.ok === false) {
        this.logger.error("Failed to load big board schools" + { error: schoolsResult.value });
        res.status(this.mapBigBoardErrorToStatusCode(schoolsResult.value)).send(schoolsResult.value.message);
        return;
      }
      schools = schoolsResult.value;
    }
    const rankedBigBoard = [...result.value.entries]
      .filter((entry) => entry.playerInfoPublished)
      .sort((a, b) =>
        (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
        (a.posRank ?? Number.MAX_SAFE_INTEGER) - (b.posRank ?? Number.MAX_SAFE_INTEGER) ||
        a.playerName.localeCompare(b.playerName)
      );
    const viewModel = {
      session,
      isAdmin: isAdminSession(session),
      bigBoard: rankedBigBoard,
      board: result.value,
      years: yearsResult.value,
      creators: BIG_BOARD_CREATORS,
      positions: POSITIONS,
      schools,
      filters: filter ?? {},
      collegeTeamColors: collegeTeam,
      helmetColorKey,
      abbreviateDraftGradeTrait,
      calculateDraftGrade,
      defaultDraftGrade,
      draftGradePositionConfig,
      effectiveDraftBoardGrade,
      formatDraftBoardGrade,
      gradeTraitCategoriesForGrade,
      publishedBoardGrade: (entry: BigBoardEntry) => this.publishedBoardGrade(entry),
      metaTitle: `${result.value.year} ${result.value.creator} Big Board | OnDraft Football`,
      metaDescription: `Explore the ${result.value.year} ${result.value.creator} OnDraft Football big board with NFL Draft prospect rankings, positions, schools, and scouting grades.`,
      metaKeywords: ["NFL Draft big board", `${result.value.year} NFL Draft`, "OnDraft rankings", "NFL Draft prospects", "football scouting"],
    };
    if (req.get("HX-Request") === "true") {
      res.render("ondraft/partials/bigBoardPanel", { ...viewModel, layout: false });
      return;
    }
    res.render("ondraft/bigboard", viewModel);
  }

  private async renderBigBoardEditor(
    res: Response,
    session: IOnDraftBrowserSession,
    board: BigBoard,
    errorMessage: string | null = null,
    statusMessage: string | null = null,
    statusCode = 200,
    fragment = false,
    validationIssues: BigBoardEditorValidationIssue[] = [],
  ): Promise<void> {
    const yearsResult = await this.service.getBigBoardYears();
    if (yearsResult.ok === false) {
      res.status(this.mapBigBoardErrorToStatusCode(yearsResult.value)).send(yearsResult.value.message);
      return;
    }

    const sortedEntries = [...board.entries].sort((a, b) => {
      const firstRank = a.rank ?? Number.MAX_SAFE_INTEGER;
      const secondRank = b.rank ?? Number.MAX_SAFE_INTEGER;
      return firstRank - secondRank || a.playerName.localeCompare(b.playerName);
    });

    const defaultBigBoardYear = await this.service.resolveDefaultBigBoardYear();

    res.status(statusCode).render("ondraft/editBigBoard", {
      session,
      isAdmin: isAdminSession(session),
      board: { ...board, entries: sortedEntries },
      years: yearsResult.value,
      creators: BIG_BOARD_CREATORS.filter((creator) => creator !== "Consensus"),
      positions: POSITIONS,
      collegeTeamNames,
      collegeTeamColors: collegeTeam,
      helmetColorKey,
      abbreviateDraftGradeTrait,
      calculateDraftGrade,
      defaultDraftGrade,
      draftGradePositionConfig,
      formatDraftBoardGrade,
      gradeTraitCategoriesForGrade,
      publishedBoardGrade: (entry: BigBoardEntry) => this.publishedBoardGrade(entry),
      errorMessage,
      statusMessage,
      validationIssues,
      defaultBigBoardYear,
      currentPath: "/bigboard/edit",
      forceOverlaySidebar: true,
      layout: fragment ? false : undefined,
    });
  }

  private renderBigBoardSaveStatus(res: Response, message: string, isError = false, statusCode = 200): void {
    res.status(statusCode).render("ondraft/partials/bigBoardSaveStatus", {
      layout: false,
      message,
      isError,
    });
  }

  private consensusDiscrepancyWriteupInput(req: Request): ConsensusDiscrepancyWriteupInput {
    return {
      year: this.parseBigBoardYear(req.body.year),
      playerName: this.formString(req.body.playerName),
      ryanWriteup: this.formString(req.body.ryanWriteup),
      aleksWriteup: this.formString(req.body.aleksWriteup),
    };
  }

  private consensusDiscrepancyValidationFields(message: string): Array<"ryanWriteup" | "aleksWriteup"> {
    if (message.includes("Ryan and Aleks")) {
      return ["ryanWriteup", "aleksWriteup"];
    }
    return [];
  }

  private missingConsensusDiscrepancyWriteupFields(input: ConsensusDiscrepancyWriteupInput): Array<"ryanWriteup" | "aleksWriteup"> {
    const fields: Array<"ryanWriteup" | "aleksWriteup"> = [];
    if (!input.ryanWriteup?.trim()) {
      fields.push("ryanWriteup");
    }
    if (!input.aleksWriteup?.trim()) {
      fields.push("aleksWriteup");
    }
    return fields;
  }

  private renderConsensusDiscrepancyWriteup(
    res: Response,
    board: BigBoard,
    entry: BigBoardEntry,
    session: IOnDraftBrowserSession,
    options: {
      statusCode?: number;
      statusMessage?: string | null;
      errorMessage?: string | null;
      validationFields?: Array<"ryanWriteup" | "aleksWriteup">;
      forceOpen?: boolean;
    } = {},
  ): void {
    res.status(options.statusCode ?? 200).render("ondraft/partials/consensusDiscrepancyWriteup", {
      layout: false,
      board,
      entry,
      isAdmin: isAdminSession(session),
      statusMessage: options.statusMessage ?? null,
      errorMessage: options.errorMessage ?? null,
      validationFields: options.validationFields ?? [],
      forceOpen: options.forceOpen ?? false,
      includeOobControls: true,
    });
  }

  private async renderUpdatedConsensusDiscrepancyWriteup(
    req: Request,
    res: Response,
    session: IOnDraftBrowserSession,
    input: ConsensusDiscrepancyWriteupInput,
    options: {
      statusMessage?: string | null;
      errorMessage?: string | null;
      validationFields?: Array<"ryanWriteup" | "aleksWriteup">;
      forceOpen?: boolean;
      statusCode?: number;
    } = {},
  ): Promise<void> {
    const year = input.year;
    const playerName = input.playerName?.trim() ?? "";
    const boardResult = await this.service.getBigBoard(year, "Consensus");
    if (boardResult.ok === false) {
      res.status(this.mapBigBoardErrorToStatusCode(boardResult.value)).send(boardResult.value.message);
      return;
    }
    const entry = boardResult.value.entries.find((candidate) => candidate.playerName === playerName);
    if (!entry) {
      res.status(404).send(`Consensus entry for ${playerName || "that player"} was not found.`);
      return;
    }
    if (req.get("HX-Request") === "true") {
      this.renderConsensusDiscrepancyWriteup(res, boardResult.value, entry, session, options);
      return;
    }
    this.renderConsensusDiscrepancyWriteup(res, boardResult.value, entry, session, options);
  }

  private bigBoardEditorEntryCardLocals(
    board: BigBoard,
    entry: BigBoardEntry,
    isTemplate = false,
    options: { forceExpandWriteup?: boolean; forceExpandGrade?: boolean } = {},
  ) {
    const heightFractionOptions = [
      { value: 0, label: "0" },
      { value: 0.125, label: " 1/8" },
      { value: 0.25, label: " 1/4" },
      { value: 0.375, label: " 3/8" },
      { value: 0.5, label: " 1/2" },
      { value: 0.625, label: " 5/8" },
      { value: 0.75, label: " 3/4" },
      { value: 0.875, label: " 7/8" },
    ];
    const heightFeetOptions = [5, 6, 7];
    const heightInchOptions = Array.from({ length: 12 }, (_, index) => index);
    const heightValue = (feet: number, inches: number) => `${feet}-${Number(inches.toFixed(3))}`;
    const selectedHeightValue = (height: BigBoardEntry["height"]) => height ? heightValue(height.feet, height.inches) : "";
    const selectedHeightFeet = (height: BigBoardEntry["height"]) => height ? height.feet : "";
    const selectedHeightInches = (height: BigBoardEntry["height"]) => height ? Math.floor(height.inches) : "";
    const selectedHeightFraction = (height: BigBoardEntry["height"]) => height ? Number((height.inches - Math.floor(height.inches)).toFixed(3)) : 0;

    return {
      layout: false,
      board,
      entry,
      index: 0,
      positions: POSITIONS,
      heightFeetOptions,
      heightInchOptions,
      heightFractionOptions,
      abbreviateDraftGradeTrait,
      calculateDraftGrade,
      defaultDraftGrade,
      draftGradePositionConfig,
      formatDraftBoardGrade,
      gradeTraitCategoriesForGrade,
      publishedBoardGrade: (candidate: BigBoardEntry) => this.publishedBoardGrade(candidate),
      selectedHeightValue,
      selectedHeightFeet,
      selectedHeightInches,
      selectedHeightFraction,
      collegeTeamColors: collegeTeam,
      helmetColorKey,
      validationIssues: [],
      isTemplate,
      forceExpandWriteup: options.forceExpandWriteup ?? false,
      forceExpandGrade: options.forceExpandGrade ?? false,
    };
  }

  private renderBigBoardEditorEntryCard(
    res: Response,
    board: BigBoard,
    entry: BigBoardEntry,
    statusCode = 200,
    options: { forceExpandWriteup?: boolean; forceExpandGrade?: boolean } = {},
  ): void {
    res.status(statusCode).render("ondraft/partials/bigBoardEditorEntryCard", this.bigBoardEditorEntryCardLocals(board, entry, false, options));
  }

  private addPublishValidationIssue(
    issues: BigBoardEditorValidationIssue[],
    entryId: string,
    field: BigBoardEditorField,
    message?: string,
  ): void {
    issues.push({ entryId, field, message });
  }

  private playerInfoPublishValidationIssues(board: BigBoard, attemptedEntryId: string, fallbackMessage: string): BigBoardEditorValidationIssue[] {
    const issues: BigBoardEditorValidationIssue[] = [];
    const attempted = board.entries.find((entry) => entry.id === attemptedEntryId);
    if (!attempted) {
      return issues;
    }

    if (!attempted.playerName) {
      this.addPublishValidationIssue(issues, attempted.id, "playerName", "Player name is required before publishing player info.");
    }
    if (!attempted.school) {
      this.addPublishValidationIssue(issues, attempted.id, "school", "School is required before publishing player info.");
    }
    if (!attempted.position || !POSITIONS.includes(attempted.position as typeof POSITIONS[number])) {
      this.addPublishValidationIssue(issues, attempted.id, "position", "Choose a valid position before publishing player info.");
    }
    if (!attempted.height) {
      this.addPublishValidationIssue(issues, attempted.id, "height", "Height is required before publishing player info.");
    }
    if (attempted.weight === null || attempted.weight <= 0) {
      this.addPublishValidationIssue(issues, attempted.id, "weight", "Weight must be a positive number before publishing player info.");
    }
    if (attempted.rank === null || attempted.rank <= 0) {
      this.addPublishValidationIssue(issues, attempted.id, "rank", "Overall rank must be a positive number before publishing player info.");
    }
    if (attempted.posRank === null || attempted.posRank <= 0) {
      this.addPublishValidationIssue(issues, attempted.id, "posRank", "Position rank must be a positive number before publishing player info.");
    }

    if (attempted.rank !== null && attempted.rank > 0) {
      const rankConflict = board.entries.find((entry) => entry.id !== attempted.id && entry.playerInfoPublished && entry.rank === attempted.rank);
      if (rankConflict) {
        this.addPublishValidationIssue(issues, attempted.id, "rank", `Overall rank ${attempted.rank} is already used by ${rankConflict.playerName || "another player"}.`);
        this.addPublishValidationIssue(issues, rankConflict.id, "rank");
      }
    }

    if (attempted.position && attempted.posRank !== null && attempted.posRank > 0) {
      const posRankConflict = board.entries.find((entry) =>
        entry.id !== attempted.id &&
        entry.playerInfoPublished &&
        entry.position === attempted.position &&
        entry.posRank === attempted.posRank
      );
      if (posRankConflict) {
        this.addPublishValidationIssue(issues, attempted.id, "posRank", `${attempted.position}${attempted.posRank} is already used by ${posRankConflict.playerName || "another player"}.`);
        this.addPublishValidationIssue(issues, posRankConflict.id, "posRank");
      }
    }

    if (issues.length === 0) {
      this.addPublishValidationIssue(issues, attempted.id, "rank", fallbackMessage);
    }
    return issues;
  }

  private writeupPublishValidationIssues(board: BigBoard, attemptedEntryId: string, fallbackMessage: string): BigBoardEditorValidationIssue[] {
    const issues: BigBoardEditorValidationIssue[] = [];
    const attempted = board.entries.find((entry) => entry.id === attemptedEntryId);
    if (!attempted) {
      return issues;
    }

    if (!attempted.writeup.strengths) {
      this.addPublishValidationIssue(issues, attempted.id, "strengths", "Strengths are required before publishing a player writeup.");
    }
    if (!attempted.writeup.weaknesses) {
      this.addPublishValidationIssue(issues, attempted.id, "weaknesses", "Weaknesses are required before publishing a player writeup.");
    }
    if (!attempted.writeup.rundown) {
      this.addPublishValidationIssue(issues, attempted.id, "rundown", "Rundown is required before publishing a player writeup.");
    }

    if (issues.length === 0) {
      this.addPublishValidationIssue(issues, attempted.id, "rundown", fallbackMessage);
    }
    return issues;
  }

  private gradePublishValidationIssues(board: BigBoard, attemptedEntryId: string, fallbackMessage: string): BigBoardEditorValidationIssue[] {
    const issues: BigBoardEditorValidationIssue[] = [];
    const attempted = board.entries.find((entry) => entry.id === attemptedEntryId);
    if (!attempted) {
      return issues;
    }

    const messages = validateDraftGradeForPublication(attempted.position, attempted.grade);
    messages.forEach((message) => this.addPublishValidationIssue(issues, attempted.id, "grade", message));

    if (issues.length === 0) {
      this.addPublishValidationIssue(issues, attempted.id, "grade", fallbackMessage);
    }
    return issues;
  }

  async showEditBigBoard(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering edit big board page");
    const selectedYear = this.parseBigBoardYear(req.query.year);
    const selectedCreator = this.parseBigBoardCreator(req.query.creator);
    const result = await this.service.getBigBoard(selectedYear, selectedCreator);
    if (result.ok === false) {
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    await this.renderBigBoardEditor(res, session, result.value, null, null, 200, req.get("HX-Request") === "true");
  }

  async showOneArticle(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void> {
    this.logger.info(`Rendering article page for "${id}"`);
    const result = await this.service.getArticle(id);
    if (result.ok === false) {
      this.logger.error(`Failed to load article "${id}"`+ { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("ondraft/notFound", {
        session,
        isAdmin: isAdminSession(session),
        title: "Article not found",
        message: "That article is no longer on tap.",
        backHref: "/articles",
        backLabel: "Back to articles",
      });
      return;
    }
    if (!result.value.published && !isAdminSession(session)) {
      res.status(404).render("ondraft/notFound", {
        session,
        isAdmin: false,
        title: "Article not found",
        message: "That article is no longer on tap.",
        backHref: "/articles",
        backLabel: "Back to articles",
      });
      return;
    }
    const article = result.value;
    res.render("ondraft/article", {
      session,
      isAdmin: isAdminSession(session),
      article,
      readMinutes: this.service.articleReadMinutes(article),
      commentsLimit: 10,
      likeActorId: this.likeActorId(session),
      articleBookmarked: (await this.bookmarkedArticleIds(session)).includes(article.id),
      userDirectoryById: await this.userDirectoryById(),
      userModerationById: await this.userModerationById(session),
      activeUserBan: await this.activeUserBan(session),
      metaTitle: `${article.title} | OnDraft Football`,
      metaDescription: this.metadataDescription(article.writeup, `Read ${article.title} on OnDraft Football.`),
      metaImage: this.absoluteMetadataUrl(res, article.imageUrl ?? "/images/brand/OnDraftLogo-cropped.png"),
      metaImageAlt: `${article.title} article thumbnail`,
      metaUrl: this.absoluteMetadataUrl(res, `/articles/${article.id}`),
      metaType: "article",
      metaKeywords: ["OnDraft Football", "NFL Draft", "NFL analysis", ...(article.tags ?? [])],
      articleAuthor: article.author,
      articlePublishedTime: new Date(article.publicationDate).toISOString(),
      articleModifiedTime: new Date(article.publicationDate).toISOString(),
      articleTags: article.tags ?? [],
      structuredDataJson: this.jsonLd(this.articleStructuredData(res, article)),
    });
  }

  private absoluteMetadataUrl(res: Response, value: string): string {
    const baseUrl = typeof res.locals.currentAbsoluteUrl === "string"
      ? res.locals.currentAbsoluteUrl
      : "http://localhost:3000/";
    return new URL(value, baseUrl).toString();
  }

  private async renderArticleActions(res: Response, article: Article, session: IOnDraftBrowserSession): Promise<void> {
    res.render("ondraft/partials/articleActions", {
      layout: false,
      article,
      session,
      likeActorId: this.likeActorId(session),
      articleBookmarked: (await this.bookmarkedArticleIds(session)).includes(article.id),
    });
  }

  async showCreateArticleForm(res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering create article page");
    res.render("ondraft/createArticle", {
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      values: {},
      existingTags: await this.getArticleTagSuggestions(),
      heading: "Create Article",
      formAction: "/articles/preview",
      saveAction: "/articles",
    });
  }

  async showCreateVideoForm(res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering create video page");
    res.render("ondraft/createVideo", {
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      values: {},
      existingTags: await this.getVideoTagSuggestions(),
      heading: "Add YouTube Video",
      formAction: "/videos",
      submitLabel: "Add video",
    });
  }

  async showEditVideoForm(res: Response, session: IOnDraftBrowserSession, videoId: string): Promise<void> {
    this.logger.info(`Rendering edit video page for "${videoId}"`);
    const result = await this.service.getYoutubeVideo(videoId);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("ondraft/notFound", {
        session,
        isAdmin: isAdminSession(session),
        title: "Video not found",
        message: "That Bar TV pour has gone missing.",
        backHref: "/videos",
        backLabel: "Back to Bar TV",
      });
      return;
    }

    res.render("ondraft/createVideo", {
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      values: this.videoFormValues(result.value),
      existingTags: await this.getVideoTagSuggestions(),
      heading: "Edit YouTube Video",
      formAction: `/videos/${result.value.videoId}`,
      submitLabel: "Save video",
    });
  }

  async showEditArticleForm(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void> {
    this.logger.info(`Rendering edit article page for "${id}"`);
    const result = await this.service.getArticle(id);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("ondraft/createArticle", {
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      values: this.articleFormValues(result.value),
      existingTags: await this.getArticleTagSuggestions(),
      heading: "Edit Article",
      formAction: `/articles/${result.value.id}/preview`,
      saveAction: `/articles/${result.value.id}`,
    });
  }

  async showArticlePreview(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void> {
    this.logger.info(`Rendering article preview page for "${id}"`);
    const result = await this.service.getArticle(id);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    this.renderArticlePreview(res, session, result.value);
  }

  async showCreateBigBoardEntryForm(res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering create big board entry page");
    res.render("ondraft/createBigBoardEntry", {
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      values: {
        year: new Date().getFullYear(),
        creator: "Ryan",
      },
      creators: BIG_BOARD_CREATORS.filter((creator) => creator !== "Consensus"),
      collegeTeamNames,
    });
  }

  async previewArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Previewing new article");
    const input = this.buildArticleInput(req, false);
    const id = req.params.id;
    const result = typeof id === "string"
      ? await this.service.previewUpdatedArticle(id, input)
      : await this.service.previewArticle(input);
    if (result.ok === false) {
      this.logger.error("Failed to preview article" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("ondraft/createArticle", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
        existingTags: await this.getArticleTagSuggestions(),
        heading: typeof id === "string" ? "Edit Article" : "Create Article",
        formAction: typeof id === "string" ? `/articles/${id}/preview` : "/articles/preview",
        saveAction: typeof id === "string" ? `/articles/${id}` : "/articles",
      });
      return;
    }

    this.renderArticlePreview(res, session, result.value);
  }

  async createArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Creating new article");
    const input = this.buildArticleInput(req, req.body.published === "false" ? false : true);
    const result = await this.service.createArticle(input);
    if (result.ok === false) {
      this.logger.error("Failed to create article" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("ondraft/createArticle", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
        existingTags: await this.getArticleTagSuggestions(),
      });
      return;
    }
    res.redirect(result.value.published ? `/articles/${result.value.id}` : "/articles?status=draft");
  }

  async createYoutubeVideo(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Creating YouTube video");
    const result = await this.service.createYoutubeVideo(this.buildYoutubeVideoInput(req));
    if (result.ok === false) {
      this.logger.error("Failed to create YouTube video" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("ondraft/createVideo", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
        existingTags: await this.getVideoTagSuggestions(),
        heading: "Add YouTube Video",
        formAction: "/videos",
        submitLabel: "Add video",
      });
      return;
    }

    res.redirect("/videos");
  }

  async updateYoutubeVideo(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const videoId = this.routeParam(req, "videoId");
    this.logger.info(`Updating YouTube video "${videoId}"`);
    const result = await this.service.updateYoutubeVideo(videoId, this.buildYoutubeVideoInput(req));
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("ondraft/createVideo", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
        existingTags: await this.getVideoTagSuggestions(),
        heading: "Edit YouTube Video",
        formAction: `/videos/${videoId}`,
        submitLabel: "Save video",
      });
      return;
    }

    res.redirect("/videos");
  }

  async updateArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Updating article");
    const id = this.routeParam(req, "id");
    const input = this.buildArticleInput(req, req.body.published === "false" ? false : true);
    const result = await this.service.updateArticle(id, input);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("ondraft/createArticle", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
        existingTags: await this.getArticleTagSuggestions(),
        heading: "Edit Article",
        formAction: `/articles/${id}/preview`,
        saveAction: `/articles/${id}`,
      });
      return;
    }

    res.redirect(result.value.published ? `/articles/${result.value.id}` : "/articles?status=draft");
  }

  async likeArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const articleId = this.routeParam(req, "id");
    const result = await this.service.likeByArticleId(articleId, this.likeActorId(session));
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    await this.renderArticleActions(res, result.value, session);
  }

  async toggleArticleBookmark(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const userId = this.requireAuthenticatedUser(res, session);
    if (!userId) {
      return;
    }

    const articleId = this.routeParam(req, "id");
    const article = await this.service.getArticle(articleId);
    if (article.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(article.value)).send(article.value.message);
      return;
    }

    const bookmark: Bookmark = { type: "article", articleId };
    const result = await this.userPreferences.toggleBookmark(userId, bookmark);
    if (result.ok === false) {
      res.status(this.mapUserPreferenceErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    this.renderBookmarkButton(res, bookmark, result.value);
  }

  async showArticleComments(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const articleId = this.routeParam(req, "id");
    const result = await this.service.getArticle(articleId);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("ondraft/partials/articleComments", {
      layout: false,
      article: result.value,
      session,
      isAdmin: isAdminSession(session),
      commentsLimit: this.commentLimit(req),
      likeActorId: this.likeActorId(session),
      errorMessage: null,
      userDirectoryById: await this.userDirectoryById(),
      userModerationById: await this.userModerationById(session),
      activeUserBan: await this.activeUserBan(session),
    });
  }

  async commentOnArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const authenticatedUser = session.authenticatedUser;
    if (!authenticatedUser) {
      res.status(403).render("ondraft/partials/error", {
        layout: false,
        message: "Log in to comment.",
      });
      return;
    }
    const activeBan = await this.activeUserBan(session);
    if (activeBan) {
      this.renderBanResponse(res, activeBan);
      return;
    }
    if (!isVerifiedUserSession(session)) {
      await this.renderArticleCommentError(req, res, session, "Verify your email before commenting.");
      return;
    }

    const articleId = this.routeParam(req, "id");
    const result = await this.service.commentByArticleId({
      articleId,
      userId: authenticatedUser.userId,
      userName: authenticatedUser.displayName,
      text: req.body.text,
      isAdmin: isAdminSession(session),
    });
    if (result.ok === false) {
      const articleResult = await this.service.getArticle(articleId);
      if (articleResult.ok === true) {
        const statusCode = result.value.name === "ArticleValidationError"
          ? 200
          : this.mapArticleErrorToStatusCode(result.value);
        res.status(statusCode).render("ondraft/partials/articleComments", {
          layout: false,
          article: articleResult.value,
          session,
          isAdmin: isAdminSession(session),
          commentsLimit: this.commentLimit(req),
          likeActorId: this.likeActorId(session),
          errorMessage: result.value.message,
          userDirectoryById: await this.userDirectoryById(),
          userModerationById: await this.userModerationById(session),
          activeUserBan: await this.activeUserBan(session),
        });
        return;
      }

      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    await this.showArticleComments(req, res, session);
  }

  async commentReply(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const authenticatedUser = session.authenticatedUser;
    if (!authenticatedUser) {
      res.status(403).render("ondraft/partials/error", {
        layout: false,
        message: "Log in to comment.",
      });
      return;
    }
    const activeBan = await this.activeUserBan(session);
    if (activeBan) {
      this.renderBanResponse(res, activeBan);
      return;
    }
    if (!isVerifiedUserSession(session)) {
      await this.renderArticleCommentError(req, res, session, "Verify your email before commenting.");
      return;
    }

    const commentId = this.routeParam(req, "commentId");
    const result = await this.service.commentReplyByCommentId(commentId, {
      parentCommentId: commentId,
      userId: authenticatedUser.userId,
      userName: authenticatedUser.displayName,
      text: req.body.text,
      isAdmin: isAdminSession(session),
    });
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    await this.showArticleComments(req, res, session);
  }

  async likeComment(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const commentId = this.routeParam(req, "commentId");
    const result = await this.service.likeByCommentId(commentId, this.likeActorId(session));
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("ondraft/partials/commentLikeButton", {
      layout: false,
      comment: result.value,
      likeActorId: this.likeActorId(session),
    });
  }

  async deleteComment(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const articleId = this.routeParam(req, "id");
    const commentId = this.routeParam(req, "commentId");
    const articleResult = await this.service.getArticle(articleId);
    if (articleResult.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(articleResult.value)).send(articleResult.value.message);
      return;
    }

    const comment = this.findCommentById(articleResult.value.comments, commentId);
    if (!comment) {
      res.status(404).send("Comment not found.");
      return;
    }

    const canDelete = isAdminSession(session) || comment.userId === session.authenticatedUser?.userId;
    if (!canDelete) {
      res.status(403).send("You can only delete your own comments.");
      return;
    }

    const result = await this.service.deleteComment(commentId);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    await this.showArticleComments(req, res, session);
  }

  async createHotTake(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const authenticatedUser = session.authenticatedUser;
    if (!authenticatedUser) {
      res.set("HX-Retarget", "#hot-take-composer");
      res.status(403).render("ondraft/partials/hotTakeComposer", {
        layout: false,
        session,
        errorMessage: "Log in to post a hot take.",
        values: req.body,
        activeUserBan: null,
      });
      return;
    }
    const activeBan = await this.activeUserBan(session);
    if (activeBan) {
      res.set("HX-Retarget", "#hot-take-composer");
      res.status(403).render("ondraft/partials/hotTakeComposer", {
        layout: false,
        session,
        errorMessage: null,
        values: req.body,
        activeUserBan: activeBan,
      });
      return;
    }
    if (!isVerifiedUserSession(session)) {
      res.set("HX-Retarget", "#hot-take-composer");
      res.status(403).render("ondraft/partials/hotTakeComposer", {
        layout: false,
        session,
        errorMessage: "Verify your email before posting a hot take.",
        values: req.body,
        activeUserBan: null,
      });
      return;
    }

    const result = await this.service.createForumPost({
      userId: authenticatedUser.userId,
      userName: authenticatedUser.displayName,
      content: req.body.content,
      isAdmin: isAdminSession(session),
    });
    if (result.ok === false) {
      res.set("HX-Retarget", "#hot-take-composer");
      res.status(result.value.name === "ForumPostValidationError" ? 200 : this.mapForumPostErrorToStatusCode(result.value))
        .render("ondraft/partials/hotTakeComposer", {
          layout: false,
          session,
          errorMessage: result.value.message,
          values: req.body,
          activeUserBan: null,
        });
      return;
    }

    const postsResult = await this.service.getFilteredForumPosts(this.buildForumPostFilter(req));
    if (postsResult.ok === false) {
      res.status(this.mapForumPostErrorToStatusCode(postsResult.value)).send(postsResult.value.message);
      return;
    }

    res.render("ondraft/partials/hotTakeCreateResponse", {
      layout: false,
      posts: postsResult.value,
      session,
      isAdmin: isAdminSession(session),
      likeActorId: this.likeActorId(session),
      bookmarkedForumPostIds: await this.bookmarkedForumPostIds(session),
      userDirectoryById: await this.userDirectoryById(),
      userModerationById: await this.userModerationById(session),
      activeUserBan: await this.activeUserBan(session),
      errorMessage: null,
      values: {},
    });
  }

  async likeHotTake(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const postId = this.routeParam(req, "id");
    const result = await this.service.likeByForumPostId(postId, this.likeActorId(session));
    if (result.ok === false) {
      res.status(this.mapForumPostErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("ondraft/partials/hotTakeActions", {
      layout: false,
      post: result.value,
      session,
      likeActorId: this.likeActorId(session),
      postBookmarked: (await this.bookmarkedForumPostIds(session)).includes(result.value.id),
    });
  }

  async toggleForumPostBookmark(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const userId = this.requireAuthenticatedUser(res, session);
    if (!userId) {
      return;
    }

    const postId = this.routeParam(req, "id");
    const post = await this.service.getForumPost(postId);
    if (post.ok === false) {
      res.status(this.mapForumPostErrorToStatusCode(post.value)).send(post.value.message);
      return;
    }

    const bookmark: Bookmark = { type: "forumPost", forumPostId: postId };
    const result = await this.userPreferences.toggleBookmark(userId, bookmark);
    if (result.ok === false) {
      res.status(this.mapUserPreferenceErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    this.renderBookmarkButton(res, bookmark, result.value);
  }

  async commentOnHotTake(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const authenticatedUser = session.authenticatedUser;
    if (!authenticatedUser) {
      res.status(403).render("ondraft/partials/error", {
        layout: false,
        message: "Log in to comment.",
      });
      return;
    }
    const activeBan = await this.activeUserBan(session);
    if (activeBan) {
      this.renderBanResponse(res, activeBan);
      return;
    }
    if (!isVerifiedUserSession(session)) {
      await this.renderHotTakeCommentError(req, res, session, "Verify your email before commenting.");
      return;
    }

    const postId = this.routeParam(req, "id");
    const result = await this.service.commentByForumPostId(postId, {
      userId: authenticatedUser.userId,
      userName: authenticatedUser.displayName,
      text: req.body.text,
      isAdmin: isAdminSession(session),
    });
    if (result.ok === false) {
      const postResult = await this.service.getForumPost(postId);
      if (postResult.ok === true) {
        res.status(result.value.name === "ForumPostValidationError" ? 200 : this.mapForumPostErrorToStatusCode(result.value))
          .render("ondraft/partials/hotTakeComments", {
            layout: false,
            post: postResult.value,
            session,
            isAdmin: isAdminSession(session),
            errorMessage: result.value.message,
            userDirectoryById: await this.userDirectoryById(),
            userModerationById: await this.userModerationById(session),
            activeUserBan: await this.activeUserBan(session),
          });
        return;
      }
      res.status(this.mapForumPostErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    const postResult = await this.service.getForumPost(postId);
    if (postResult.ok === false) {
      res.status(this.mapForumPostErrorToStatusCode(postResult.value)).send(postResult.value.message);
      return;
    }
    res.render("ondraft/partials/hotTakeComments", {
      layout: false,
      post: postResult.value,
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      userDirectoryById: await this.userDirectoryById(),
      userModerationById: await this.userModerationById(session),
      activeUserBan: await this.activeUserBan(session),
    });
  }

  async deleteHotTakeComment(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const postId = this.routeParam(req, "id");
    const commentId = this.routeParam(req, "commentId");
    const postResult = await this.service.getForumPost(postId);
    if (postResult.ok === false) {
      res.status(this.mapForumPostErrorToStatusCode(postResult.value)).send(postResult.value.message);
      return;
    }

    const comment = postResult.value.comments.find((entry) => entry.id === commentId);
    if (!comment) {
      res.status(404).send("Comment not found.");
      return;
    }

    const canDelete = isAdminSession(session) || comment.userId === session.authenticatedUser?.userId;
    if (!canDelete) {
      res.status(403).send("You can only delete your own comments.");
      return;
    }

    const result = await this.service.deleteForumPostComment(commentId);
    if (result.ok === false) {
      res.status(this.mapForumPostErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    const updatedPost = await this.service.getForumPost(postId);
    if (updatedPost.ok === false) {
      res.status(this.mapForumPostErrorToStatusCode(updatedPost.value)).send(updatedPost.value.message);
      return;
    }

    res.render("ondraft/partials/hotTakeComments", {
      layout: false,
      post: updatedPost.value,
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      userDirectoryById: await this.userDirectoryById(),
      userModerationById: await this.userModerationById(session),
      activeUserBan: await this.activeUserBan(session),
    });
  }

  async deleteHotTake(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const postId = this.routeParam(req, "id");
    const postResult = await this.service.getForumPost(postId);
    if (postResult.ok === false) {
      res.status(this.mapForumPostErrorToStatusCode(postResult.value)).send(postResult.value.message);
      return;
    }
    if (!this.canDeleteForumPost(postResult.value, session)) {
      res.status(403).send("You can only delete your own hot takes.");
      return;
    }

    const result = await this.service.deleteForumPost(postId);
    if (result.ok === false) {
      res.status(this.mapForumPostErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.status(200).send("");
  }

  async createBigBoardEntry(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Creating new big board entry");
    const input = {
      year: Number(req.body.year),
      creator: this.parseBigBoardCreator(req.body.creator),
      playerName: req.body.playerName,
      position: req.body.position,
      school: req.body.school,
      rank: Number(req.body.rank),
      posRank: Number(req.body.posRank),
      writeup: req.body.writeup,
      age: Number(req.body.age),
      height: {
        feet: Number(req.body.height?.feet),
        inches: Number(req.body.height?.inches),
      },
      weight: Number(req.body.weight),
    };
    const result = await this.service.createBigBoardEntry(input);
    if (result.ok === false) {
      this.logger.error("Failed to create big board entry" + {error: result.value });
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).render("ondraft/createBigBoardEntry", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
        creators: BIG_BOARD_CREATORS.filter((creator) => creator !== "Consensus"),
        collegeTeamNames,
      });
      return;
    }
    res.redirect(`/bigboard?year=${input.year}&creator=${input.creator ?? "Ryan"}`);
  }

  async createBigBoardYear(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Creating big board year");
    const year = this.parseBigBoardYear(req.body.year);
    const creator = this.parseBigBoardCreator(req.body.creator) ?? "Ryan";
    const result = await this.service.createBigBoardYear(year);
    if (result.ok === false) {
      const board = await this.service.getBigBoard(undefined, creator);
      if (board.ok === true) {
        await this.renderBigBoardEditor(res, session, board.value, result.value.message, null, this.mapBigBoardErrorToStatusCode(result.value));
        return;
      }
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.redirect(`/bigboard/edit?year=${year}&creator=${encodeURIComponent(creator)}`);
  }

  async deleteBigBoardYear(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Deleting big board year");
    const year = this.parseBigBoardYear(req.body.year);
    const creator = this.parseBigBoardCreator(req.body.creator) ?? "Ryan";
    const result = await this.service.deleteBigBoardYear(year);
    if (result.ok === false) {
      const board = await this.service.getBigBoard(undefined, creator);
      if (board.ok === true) {
        await this.renderBigBoardEditor(res, session, board.value, result.value.message, null, this.mapBigBoardErrorToStatusCode(result.value));
        return;
      }
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    const yearsResult = await this.service.getBigBoardYears();
    if (yearsResult.ok === false) {
      res.status(this.mapBigBoardErrorToStatusCode(yearsResult.value)).send(yearsResult.value.message);
      return;
    }

    const nextYear = yearsResult.value[0] ?? new Date().getFullYear();
    if (yearsResult.value.length === 0) {
      const createDefaultYear = await this.service.createBigBoardYear(nextYear);
      if (createDefaultYear.ok === false && createDefaultYear.value.name !== "DuplicateBigBoardYear") {
        res.status(this.mapBigBoardErrorToStatusCode(createDefaultYear.value)).send(createDefaultYear.value.message);
        return;
      }
    }

    res.redirect(`/bigboard/edit?year=${nextYear}&creator=${encodeURIComponent(creator)}`);
  }

  async saveBigBoard(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Saving big board edits");
    const input = this.buildBigBoardEntriesInput(req);
    const result = await this.service.saveBigBoardEntries(input);
    if (result.ok === false) {
      const board = await this.service.getBigBoard(input.year, input.creator);
      if (board.ok === true) {
        await this.renderBigBoardEditor(
          res,
          session,
          board.value,
          result.value.message,
          null,
          this.mapBigBoardErrorToStatusCode(result.value),
          req.get("HX-Request") === "true",
        );
        return;
      }
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    if (req.body.action === "exit") {
      res.redirect(`/bigboard?year=${result.value.year}&creator=${encodeURIComponent(result.value.creator)}`);
      return;
    }

    await this.renderBigBoardEditor(res, session, result.value, null, "Saved.", 200, req.get("HX-Request") === "true");
  }

  async saveBigBoardEntry(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Saving big board entry edits");
    const input = this.buildBigBoardEntriesInput(req);
    const forceExpandWriteup = this.formBoolean(req.body.expandWriteup);
    const forceExpandGrade = this.formBoolean(req.body.expandGrade);
    const entry = input.entries[0];
    if (!entry) {
      const board = await this.service.getBigBoard(input.year, input.creator);
      if (board.ok === true) {
        await this.renderBigBoardEditor(res, session, board.value, "Add at least one player detail before saving this card.", null, 400);
        return;
      }
      res.status(400).send("Add at least one player detail before saving this card.");
      return;
    }

    const result = await this.service.saveBigBoardEntry({
      year: input.year,
      creator: input.creator,
      entry,
    });
    const board = await this.service.getBigBoard(input.year, input.creator);
    if (board.ok === false) {
      res.status(this.mapBigBoardErrorToStatusCode(board.value)).send(board.value.message);
      return;
    }
    if (result.ok === false) {
      if (req.get("HX-Request") === "true") {
        res.set("HX-Retarget", "#big-board-editor-fragment");
        res.set("HX-Reswap", "outerHTML show:none");
        await this.renderBigBoardEditor(res, session, board.value, result.value.message, null, 200, true);
        return;
      }
      await this.renderBigBoardEditor(res, session, board.value, result.value.message, null, this.mapBigBoardErrorToStatusCode(result.value));
      return;
    }

    const playerName = result.value.playerName || "draft board entry";
    if (req.get("HX-Request") === "true") {
      this.renderBigBoardEditorEntryCard(res, board.value, result.value, 200, { forceExpandWriteup, forceExpandGrade });
      return;
    }
    await this.renderBigBoardEditor(res, session, board.value, null, `Saved ${playerName}.`);
  }

  async autosaveBigBoard(req: Request, res: Response, _session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Autosaving big board edits");
    const result = await this.service.saveBigBoardEntries(this.buildBigBoardEntriesInput(req));
    if (result.ok === false) {
      this.renderBigBoardSaveStatus(res, result.value.message, true, 200);
      return;
    }

    this.renderBigBoardSaveStatus(res, "Autosaved.");
  }

  private async saveThenPublishBigBoardEntry(
    req: Request,
    res: Response,
    session: IOnDraftBrowserSession,
    publish: (year: number | undefined, creator: BigBoardCreator | undefined, entryId: string) => Promise<{ ok: true; value: BigBoardEntry } | { ok: false; value: BigBoardError }>,
    validationIssuesFor: (board: BigBoard, attemptedEntryId: string, message: string) => BigBoardEditorValidationIssue[],
    successMessage: string,
  ): Promise<void> {
    const input = this.buildBigBoardEntriesInput(req);
    const forceExpandWriteup = this.formBoolean(req.body.expandWriteup);
    const forceExpandGrade = this.formBoolean(req.body.expandGrade);
    const entryId = this.formString(req.body.entryId);
    const entry = input.entries.find((candidate) => candidate.id === entryId) ?? input.entries[0];
    if (!entry) {
      const board = await this.service.getBigBoard(input.year, input.creator);
      if (board.ok === true) {
        await this.renderBigBoardEditor(res, session, board.value, "Save the player card before publishing it.", null, 400);
        return;
      }
      res.status(400).send("Save the player card before publishing it.");
      return;
    }

    const saved = await this.service.saveBigBoardEntry({
      year: input.year,
      creator: input.creator,
      entry,
    });
    if (saved.ok === false) {
      const board = await this.service.getBigBoard(input.year, input.creator);
      if (board.ok === true) {
        if (req.get("HX-Request") === "true") {
          res.set("HX-Retarget", "#big-board-editor-fragment");
          res.set("HX-Reswap", "outerHTML show:none");
          await this.renderBigBoardEditor(res, session, board.value, saved.value.message, null, 200, true);
          return;
        }
        await this.renderBigBoardEditor(res, session, board.value, saved.value.message, null, this.mapBigBoardErrorToStatusCode(saved.value));
        return;
      }
      res.status(this.mapBigBoardErrorToStatusCode(saved.value)).send(saved.value.message);
      return;
    }

    const published = await publish(input.year, input.creator, saved.value.id);
    const updatedBoard = await this.service.getBigBoard(input.year, input.creator);
    if (updatedBoard.ok === false) {
      res.status(this.mapBigBoardErrorToStatusCode(updatedBoard.value)).send(updatedBoard.value.message);
      return;
    }
    if (published.ok === false) {
      const validationIssues = validationIssuesFor(updatedBoard.value, saved.value.id, published.value.message);
      if (req.get("HX-Request") === "true") {
        res.set("HX-Retarget", "#big-board-editor-fragment");
        res.set("HX-Reswap", "outerHTML show:none");
        await this.renderBigBoardEditor(res, session, updatedBoard.value, published.value.message, null, 200, true, validationIssues);
        return;
      }
      await this.renderBigBoardEditor(res, session, updatedBoard.value, published.value.message, null, this.mapBigBoardErrorToStatusCode(published.value), false, validationIssues);
      return;
    }

    if (req.get("HX-Request") === "true") {
      const publishedEntry = updatedBoard.value.entries.find((candidate) => candidate.id === published.value.id) ?? published.value;
      this.renderBigBoardEditorEntryCard(res, updatedBoard.value, publishedEntry, 200, { forceExpandWriteup, forceExpandGrade });
      return;
    }
    await this.renderBigBoardEditor(res, session, updatedBoard.value, null, successMessage);
  }

  async publishBigBoardPlayerInfo(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Publishing big board player info");
    await this.saveThenPublishBigBoardEntry(
      req,
      res,
      session,
      (year, creator, entryId) => this.service.publishBigBoardEntryPlayerInfo(year, creator, entryId),
      (board, entryId, message) => this.playerInfoPublishValidationIssues(board, entryId, message),
      "Player info published.",
    );
  }

  async publishBigBoardGrade(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Publishing big board grade");
    await this.saveThenPublishBigBoardEntry(
      req,
      res,
      session,
      (year, creator, entryId) => this.service.publishBigBoardEntryGrade(year, creator, entryId),
      (board, entryId, message) => this.gradePublishValidationIssues(board, entryId, message),
      "Grade published.",
    );
  }

  async publishBigBoardWriteup(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Publishing big board writeup");
    await this.saveThenPublishBigBoardEntry(
      req,
      res,
      session,
      (year, creator, entryId) => this.service.publishBigBoardEntryWriteup(year, creator, entryId),
      (board, entryId, message) => this.writeupPublishValidationIssues(board, entryId, message),
      "Writeup published.",
    );
  }

  async saveConsensusDiscrepancyWriteup(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Saving consensus discrepancy writeup");
    const input = this.consensusDiscrepancyWriteupInput(req);
    const result = await this.service.saveConsensusDiscrepancyWriteup(input);
    if (result.ok === false) {
      await this.renderUpdatedConsensusDiscrepancyWriteup(req, res, session, input, {
        errorMessage: result.value.message,
        validationFields: this.consensusDiscrepancyValidationFields(result.value.message),
        forceOpen: true,
        statusCode: req.get("HX-Request") === "true" ? 200 : this.mapBigBoardErrorToStatusCode(result.value),
      });
      return;
    }

    await this.renderUpdatedConsensusDiscrepancyWriteup(req, res, session, input, {
      statusMessage: "Saved.",
      forceOpen: true,
    });
  }

  async publishConsensusDiscrepancyWriteup(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Publishing consensus discrepancy writeup");
    const input = this.consensusDiscrepancyWriteupInput(req);
    const result = await this.service.publishConsensusDiscrepancyWriteup(input);
    if (result.ok === false) {
      await this.renderUpdatedConsensusDiscrepancyWriteup(req, res, session, input, {
        errorMessage: result.value.message,
        validationFields: result.value.message.includes("Ryan and Aleks")
          ? this.missingConsensusDiscrepancyWriteupFields(input)
          : this.consensusDiscrepancyValidationFields(result.value.message),
        forceOpen: true,
        statusCode: req.get("HX-Request") === "true" ? 200 : this.mapBigBoardErrorToStatusCode(result.value),
      });
      return;
    }

    await this.renderUpdatedConsensusDiscrepancyWriteup(req, res, session, input, {
      statusMessage: "Published.",
      forceOpen: false,
    });
  }

  async deleteBigBoardEntryFromEditor(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Deleting big board entry from editor");
    const year = this.parseBigBoardYear(req.body.year);
    const creator = this.parseBigBoardCreator(req.body.creator);
    const entryId = this.formString(req.body.entryId);
    const input = this.buildBigBoardEntriesInput(req);
    const postedEntry = input.entries[0];
    const postedPlayerName = this.formString(postedEntry?.playerName);
    const board = await this.service.getBigBoard(year, creator);
    if (board.ok === false) {
      res.status(this.mapBigBoardErrorToStatusCode(board.value)).send(board.value.message);
      return;
    }

    const entry = board.value.entries.find((candidate) => candidate.id === entryId)
      ?? board.value.entries.find((candidate) => postedPlayerName !== "" && candidate.playerName === postedPlayerName);
    if (!entry) {
      if (req.get("HX-Request") === "true") {
        res.status(200).send("");
        return;
      }
      await this.renderBigBoardEditor(res, session, board.value, `Big board entry with id "${entryId}" was not found.`, null, 404);
      return;
    }

    if (req.get("HX-Request") === "true") {
      res.status(200).send("");
      return;
    }

    const result = await this.service.deleteBigBoardEntry(year, creator, entry.playerName);
    const updatedBoard = await this.service.getBigBoard(year, creator);
    if (updatedBoard.ok === false) {
      res.status(this.mapBigBoardErrorToStatusCode(updatedBoard.value)).send(updatedBoard.value.message);
      return;
    }
    if (result.ok === false) {
      if (req.get("HX-Request") === "true") {
        res.status(200).send("");
        return;
      }
      await this.renderBigBoardEditor(res, session, updatedBoard.value, result.value.message, null, this.mapBigBoardErrorToStatusCode(result.value));
      return;
    }
    await this.renderBigBoardEditor(res, session, updatedBoard.value, null, `Deleted ${entry.playerName || "draft board entry"}.`);
  }

  async deleteArticle(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Deleting article");
    const id = req.params.id;
    const result = await this.service.deleteArticle(id);
    if (result.ok === false) {
      this.logger.error(`Failed to delete article "${id}" ` + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.status(200).send("");
  }

  async deleteYoutubeVideo(req: Request, res: Response, _session: IOnDraftBrowserSession): Promise<void> {
    const videoId = this.routeParam(req, "videoId");
    this.logger.info(`Deleting YouTube video "${videoId}"`);
    const result = await this.service.deleteYoutubeVideo(videoId);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.redirect("/videos");
  }

  async deleteBigBoardEntry(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Deleting big board entry");
    const playerName = req.params.playerName;
    const year = this.parseBigBoardYear(req.query.year);
    const creator = this.parseBigBoardCreator(req.query.creator);
    const result = await this.service.deleteBigBoardEntry(year, creator, playerName);
    if (result.ok === false) {
      this.logger.error(`Failed to delete big board entry for player "${playerName}" ` + { error: result.value });
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
  }

  private withReadMinutes(articles: Article[]): Array<Article & { readMinutes: number | null }> {
    return articles.map((article) => ({ ...article, readMinutes: this.service.articleReadMinutes(article) }));
  }

  async setDefaultBigBoardYear(req: Request, res: Response, _session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Setting default big board year");
    const year = this.parseBigBoardYear(req.body.year);
    const creator = this.parseBigBoardCreator(req.body.creator) ?? "Ryan";
    const result = await this.service.setDefaultBigBoardYear(year);
    if (result.ok === false) {
      if (req.get("HX-Request") === "true") {
        const defaultBigBoardYear = await this.service.resolveDefaultBigBoardYear();
        res.status(this.mapBigBoardErrorToStatusCode(result.value)).render("ondraft/partials/bigBoardDefaultYearControl", {
          layout: false,
          board: { year: year ?? defaultBigBoardYear, creator },
          defaultBigBoardYear,
          errorMessage: result.value.message,
        });
        return;
      }
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    if (req.get("HX-Request") === "true") {
      res.render("ondraft/partials/bigBoardDefaultYearControl", {
        layout: false,
        board: { year: result.value, creator },
        defaultBigBoardYear: result.value,
        errorMessage: null,
      });
      return;
    }
    res.redirect(`/bigboard/edit?year=${result.value}&creator=${encodeURIComponent(creator)}`);
  }

  // v2.1 c8-search
  async showSearch(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering search page");
    const rawTerm = (this.queryString(req, "q") ?? "").trim().slice(0, 100);
    let results: SiteSearchResults | null = null;
    if (rawTerm.length >= 2) {
      const result = await this.service.searchSite(rawTerm);
      if (result.ok === false && result.value.name !== "ArticleValidationError") {
        res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
        return;
      }
      if (result.ok === true) {
        results = result.value;
      }
    }
    const viewModel = {
      session,
      isAdmin: isAdminSession(session),
      query: rawTerm,
      results,
      metaTitle: "Search | OnDraft Football",
      metaDescription: "Search OnDraft Football articles, videos, Taproom hot takes, and draft board prospects.",
      metaRobots: "noindex, follow",
    };
    if (req.get("HX-Request") === "true") {
      res.render("ondraft/partials/searchResults", { ...viewModel, layout: false });
      return;
    }
    res.render("ondraft/search", viewModel);
  }

  async showSearchSuggest(req: Request, res: Response, _session: IOnDraftBrowserSession): Promise<void> {
    const rawTerm = (this.queryString(req, "q") ?? "").trim().slice(0, 100);
    if (rawTerm.length < 2) {
      res.render("ondraft/partials/searchSuggest", { layout: false, query: rawTerm, results: null });
      return;
    }
    const result = await this.service.searchSite(rawTerm, { limitPerType: 3 });
    res.render("ondraft/partials/searchSuggest", {
      layout: false,
      query: rawTerm,
      results: result.ok === true ? result.value : null,
    });
  }
}

export function CreateOnDraftController(
  service: IOnDraftService,
  userPreferences: IUserPreferenceService,
  logger: ILoggingService,
  authService: IAuthService,
  analytics?: IAnalyticsService,
): IOnDraftController {
  return new OnDraftController(service, userPreferences, logger, authService, analytics);
}
