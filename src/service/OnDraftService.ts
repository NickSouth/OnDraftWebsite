import { randomInt } from "node:crypto";
import { Err, Ok, Result } from "../lib/result";
import sanitizeHtml from "sanitize-html";
import { Article, ArticleContent, BIG_BOARD_CREATORS, BigBoard, BigBoardCreator, BigBoardEntry, BigBoardWriteup, Height, POSITIONS, Position, ArticleFilter, Comment, ForumPost, ForumPostFilter } from "../model/OnDraftContent";
import { UnknownArticleError, UnknownForumPostError, ArticleError,  BigBoardError, IOnDraftRepository, ArticleValidationError, BigBoardValidationError, ForumPostError, ForumPostValidationError } from "../repository/OnDraftRepository";

const ARTICLE_PDF_MAX_BYTES = 5 * 1024 * 1024;
const ARTICLE_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ARTICLE_ID_LENGTH = 5;
const ARTICLE_ID_MAX_ATTEMPTS = 10;
const COMMENT_ID_LENGTH = 8;
const BIG_BOARD_ENTRY_ID_LENGTH = 8;
const DEFAULT_ARTICLE_IMAGE_URLS = [
  "/images/article-defaults/football.png",
  "/images/article-defaults/helmet.png",
  "/images/article-defaults/uprights.png",
];
const ARTICLE_WRITEUP_MAX_LENGTH = 200;
const ARTICLE_TAG_MAX_LENGTH = 24;
const ARTICLE_TAG_MAX_COUNT = 12;
const ARTICLE_TAG_PATTERN = /^[a-z0-9-]+$/;
const COMMENT_TEXT_MAX_LENGTH = 1000;
const DEFAULT_BIG_BOARD_CREATOR: BigBoardCreator = "Ryan";
const HOT_TAKE_MAX_LENGTH = 300;

export interface CreateArticleInput {
  title: string;
  author: string;
  writeup: string;
  tags?: string[];
  published?: boolean;
  publicationDate: Date;
  content: ArticleContent;
  imageUrl?: string;
}

export interface BigBoardEntryInput {
  year?: number;
  creator?: BigBoardCreator;
  id?: string;
  playerName: string;
  position: string;
  school: string;
  rank: number;
  posRank: number;
  writeup?: string;
  strengths?: string;
  weaknesses?: string;
  rundown?: string;
  notes?: string;
  height: {
    feet: number;
    inches: number;
  };
  weight: number;
  playerInfoPublished?: boolean;
  writeupPublished?: boolean;
}

export interface BigBoardEditableEntryInput {
  id?: string;
  playerName?: string;
  position?: string;
  school?: string;
  rank?: number | string | null;
  posRank?: number | string | null;
  height?: Height | null;
  weight?: number | string | null;
  writeup?: Partial<BigBoardWriteup> | string;
  strengths?: string;
  weaknesses?: string;
  rundown?: string;
  notes?: string;
  playerInfoPublished?: boolean;
  writeupPublished?: boolean;
}

export interface SaveBigBoardEntriesInput {
  year?: number;
  creator?: BigBoardCreator;
  entries: BigBoardEditableEntryInput[];
}

export interface CreateCommentInput {
  articleId?: string;
  parentCommentId?: string;
  userId: string;
  userName: string;
  text: string;
}

export interface ForumPostInput {
  content: string;
  userId: string;
  userName: string;
}

export interface IOnDraftService {
  previewArticle(input: CreateArticleInput): Promise<Result<Article, ArticleError>>;
  createArticle(input: CreateArticleInput): Promise<Result<Article, ArticleError>>;
  previewUpdatedArticle(id: string, input: CreateArticleInput): Promise<Result<Article, ArticleError>>;
  updateArticle(id: string, input: CreateArticleInput): Promise<Result<Article, ArticleError>>;
  createBigBoardEntry(input: BigBoardEntryInput): Promise<Result<BigBoardEntry, BigBoardError>>;
  saveBigBoardEntries(input: SaveBigBoardEntriesInput): Promise<Result<BigBoard, BigBoardError>>;
  publishBigBoardEntryPlayerInfo(year: number | undefined, creator: BigBoardCreator | undefined, entryId: string): Promise<Result<BigBoardEntry, BigBoardError>>;
  publishBigBoardEntryWriteup(year: number | undefined, creator: BigBoardCreator | undefined, entryId: string): Promise<Result<BigBoardEntry, BigBoardError>>;
  deleteArticle(id: string): Promise<Result<void, ArticleError>>;
  deleteBigBoardEntry(year: number | undefined, creator: BigBoardCreator | undefined, playerName: string): Promise<Result<void, BigBoardError>>;
  getBigBoard(year?: number, creator?: BigBoardCreator): Promise<Result<BigBoard, BigBoardError>>;
  getBigBoardYears(): Promise<Result<number[], BigBoardError>>;
  getArticles(published?: boolean): Promise<Result<Article[], ArticleError>>;
  getArticleTags(): Promise<Result<string[], ArticleError>>;
  getBigBoardEntry(year: number | undefined, creator: BigBoardCreator | undefined, playerName: string): Promise<Result<BigBoardEntry, BigBoardError>>;
  getArticle(id: string): Promise<Result<Article, ArticleError>>;
  getFilteredArticles(filter: ArticleFilter): Promise<Result<Article[], ArticleError>>;
  commentByArticleId(input: CreateCommentInput): Promise<Result<Comment, ArticleError>>;
  likeByArticleId(articleId: string, userId: string): Promise<Result<Article, ArticleError>>;
  likeByCommentId(commentId: string, userId: string): Promise<Result<Comment, ArticleError>>;
  deleteComment(commentId: string): Promise<Result<void, ArticleError>>;
  commentReplyByCommentId(commentId: string, reply: CreateCommentInput): Promise<Result<Comment, ArticleError>>;
  createForumPost(input: ForumPostInput): Promise<Result<ForumPost, ForumPostError>>;
  getForumPosts(): Promise<Result<ForumPost[], ForumPostError>>;
  getForumPost(postId: string): Promise<Result<ForumPost, ForumPostError>>;
  likeByForumPostId(postId: string, userId: string): Promise<Result<ForumPost, ForumPostError>>;
  commentByForumPostId(postId: string, comment: CreateCommentInput): Promise<Result<Comment, ForumPostError>>;
  getFilteredForumPosts(filter: ForumPostFilter): Promise<Result<ForumPost[], ForumPostError>>;
  deleteForumPost(postId: string): Promise<Result<void, ForumPostError>>;
}

class OnDraftService implements IOnDraftService {
  constructor(private readonly repository: IOnDraftRepository) {}

  private defaultBigBoardYear(): number {
    return new Date().getFullYear();
  }

  private normalizeBigBoardYear(year?: number): Result<number, BigBoardError> {
    const normalizedYear = year ?? this.defaultBigBoardYear();
    if (!Number.isInteger(normalizedYear) || normalizedYear < 1900 || normalizedYear > 2100) {
      return Err(BigBoardValidationError("Big board year must be a valid four-digit year."));
    }
    return Ok(normalizedYear);
  }

  private normalizeBigBoardCreator(creator?: BigBoardCreator): Result<BigBoardCreator, BigBoardError> {
    const normalizedCreator = creator ?? DEFAULT_BIG_BOARD_CREATOR;
    if (!BIG_BOARD_CREATORS.includes(normalizedCreator)) {
      return Err(BigBoardValidationError(`Big board creator must be one of: ${BIG_BOARD_CREATORS.join(", ")}`));
    }
    return Ok(normalizedCreator);
  }

  private normalizeBigBoardKey(year?: number, creator?: BigBoardCreator): Result<{ year: number; creator: BigBoardCreator }, BigBoardError> {
    const normalizedYear = this.normalizeBigBoardYear(year);
    if (normalizedYear.ok === false) {
      return Err(normalizedYear.value);
    }
    const normalizedCreator = this.normalizeBigBoardCreator(creator);
    if (normalizedCreator.ok === false) {
      return Err(normalizedCreator.value);
    }
    return Ok({ year: normalizedYear.value, creator: normalizedCreator.value });
  }

  private createArticleId(): string {
    return this.createRandomId(ARTICLE_ID_LENGTH);
  }

  private createCommentId(): string {
    return this.createRandomId(COMMENT_ID_LENGTH);
  }

  private createBigBoardEntryId(): string {
    return this.createRandomId(BIG_BOARD_ENTRY_ID_LENGTH);
  }

  private defaultArticleImageUrl(): string {
    return DEFAULT_ARTICLE_IMAGE_URLS[randomInt(DEFAULT_ARTICLE_IMAGE_URLS.length)];
  }

  private createRandomId(length: number): string {
    let id = "";
    for (let index = 0; index < length; index += 1) {
      id += ARTICLE_ID_ALPHABET[randomInt(ARTICLE_ID_ALPHABET.length)];
    }
    return id;
  }

  private sanitizeArticleHtml(body: string): string {
    return sanitizeHtml(body, {
      allowedTags: [
        "a",
        "blockquote",
        "br",
        "code",
        "div",
        "em",
        "h2",
        "h3",
        "h4",
        "hr",
        "li",
        "ol",
        "p",
        "pre",
        "span",
        "strong",
        "ul",
      ],
      allowedAttributes: {
        a: ["href", "title", "target", "rel"],
      },
      allowedSchemes: ["http", "https", "mailto"],
      transformTags: {
        a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
      },
    }).trim();
  }

  private sanitizeArticleContent(content: ArticleContent): ArticleContent {
    if (content.type === "html") {
      return {
        type: "html",
        body: this.sanitizeArticleHtml(content.body),
      };
    }

    return content;
  }

  private normalizeArticleTags(tags: string[] | undefined): string[] {
    const uniqueTags = new Map<string, string>();
    (tags ?? []).forEach((tag) => {
      const normalized = tag.trim().toLowerCase().replace(/\s+/g, "-");
      if (normalized) {
        uniqueTags.set(normalized, normalized);
      }
    });

    return [...uniqueTags.values()];
  }

  private validateArticleTags(tags: string[]): Result<void, ArticleError> {
    if (tags.length > ARTICLE_TAG_MAX_COUNT) {
      return Err(ArticleValidationError(`Articles can have no more than ${ARTICLE_TAG_MAX_COUNT} tags.`));
    }

    const invalidTag = tags.find((tag) => tag.length > ARTICLE_TAG_MAX_LENGTH || !ARTICLE_TAG_PATTERN.test(tag));
    if (invalidTag) {
      return Err(ArticleValidationError("Tags must be short and use only letters, numbers, and hyphens."));
    }

    return Ok(undefined);
  }

  private validateArticleContent(content: ArticleContent | undefined): Result<void, ArticleError> {
    if (!content) {
      return Err(ArticleValidationError("Article content is required."));
    }

    if (content.type === "html") {
      if (typeof content.body !== "string" || content.body.trim() === "") {
        return Err(ArticleValidationError("Title, author, and content cannot be empty."));
      }
      return Ok(undefined);
    }

    if (content.type === "plainText") {
      if (typeof content.text !== "string" || content.text.trim() === "") {
        return Err(ArticleValidationError("Title, author, and content cannot be empty."));
      }
      return Ok(undefined);
    }

    if (content.type !== "pdf") {
      return Err(ArticleValidationError("Unsupported article content type."));
    }

    if (!content.url || !content.originalName || content.mimeType !== "application/pdf" || content.size <= 0) {
      return Err(ArticleValidationError("A valid PDF article upload is required."));
    }
    if (content.size > ARTICLE_PDF_MAX_BYTES) {
      return Err(ArticleValidationError("PDF uploads must be 5 MB or smaller."));
    }

    return Ok(undefined);
  }

  private validateArticleInput(input: CreateArticleInput): Result<void, ArticleError> {
    if (!input.title || !input.author || !input.writeup || !input.publicationDate || !input.content) {
      return Err(ArticleValidationError("Title, author, writeup, publication date, and content are required."));
    }
    if (input.title.trim() === "" || input.author.trim() === "" || input.writeup.trim() === "") {
      return Err(ArticleValidationError("Title, author, and writeup cannot be empty."));
    }
    if (input.writeup.length > ARTICLE_WRITEUP_MAX_LENGTH) {
      return Err(ArticleValidationError(`Writeup cannot be more than ${ARTICLE_WRITEUP_MAX_LENGTH} characters.`));
    }
    if (isNaN(input.publicationDate.getTime())) {
      return Err(ArticleValidationError("Invalid publication date."));
    }
    if (
      input.imageUrl &&
      !/^\/uploads\/articles\/.+\.(jpg|jpeg|png|gif|webp)$/.test(input.imageUrl) &&
      !DEFAULT_ARTICLE_IMAGE_URLS.includes(input.imageUrl)
    ) {
      return Err(ArticleValidationError("Invalid image upload path."));
    }
    if (input.publicationDate > new Date()) {
      return Err(ArticleValidationError("Publication date cannot be in the future."));
    }
    const tagValidation = this.validateArticleTags(input.tags ?? []);
    if (tagValidation.ok === false) {
      return Err(tagValidation.value);
    }
    return this.validateArticleContent(input.content);
  }

  private normalizeNullableInteger(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const normalized = typeof value === "number" ? value : Number(value);
    return Number.isInteger(normalized) ? normalized : null;
  }

  private normalizeHeight(height: Height | null | undefined): Height | null {
    if (!height) {
      return null;
    }
    const feet = this.normalizeNullableInteger(height.feet);
    const inches = this.normalizeNullableInteger(height.inches);
    if (feet === null || inches === null) {
      return null;
    }
    return { feet, inches };
  }

  private normalizeBigBoardWriteup(input: BigBoardEntryInput | BigBoardEditableEntryInput): BigBoardWriteup {
    if (typeof input.writeup === "object" && input.writeup !== null) {
      return {
        strengths: input.writeup.strengths?.trim() ?? "",
        weaknesses: input.writeup.weaknesses?.trim() ?? "",
        rundown: input.writeup.rundown?.trim() ?? "",
      };
    }

    return {
      strengths: input.strengths?.trim() ?? "",
      weaknesses: input.weaknesses?.trim() ?? "",
      rundown: input.rundown?.trim() ?? (typeof input.writeup === "string" ? input.writeup.trim() : ""),
    };
  }

  private normalizeBigBoardEntry(input: BigBoardEditableEntryInput, existing?: BigBoardEntry): BigBoardEntry {
    return {
      id: input.id?.trim() || existing?.id || this.createBigBoardEntryId(),
      playerName: input.playerName?.trim() ?? existing?.playerName ?? "",
      position: POSITIONS.includes(input.position as Position) ? input.position as Position : "",
      school: input.school?.trim() ?? existing?.school ?? "",
      rank: this.normalizeNullableInteger(input.rank),
      posRank: this.normalizeNullableInteger(input.posRank),
      height: this.normalizeHeight(input.height),
      weight: this.normalizeNullableInteger(input.weight),
      playerInfoPublished: existing?.playerInfoPublished ?? false,
      writeup: this.normalizeBigBoardWriteup(input),
      writeupPublished: existing?.writeupPublished ?? false,
      notes: input.notes?.trim() ?? existing?.notes ?? "",
    };
  }

  private validatePlayerInfoForPublication(entry: BigBoardEntry): Result<void, BigBoardError> {
    if (!entry.playerName || !entry.school || !entry.position || !entry.height || entry.weight === null || entry.rank === null || entry.posRank === null) {
      return Err(BigBoardValidationError("Player name, school, position, height, weight, rank, and position rank are required before publishing player info."));
    }
    if (!POSITIONS.includes(entry.position as Position)) {
      return Err(BigBoardValidationError(`Position must be one of: ${POSITIONS.join(", ")}`));
    }
    if (entry.height.feet < 0 || entry.height.inches < 0 || entry.height.inches >= 12) {
      return Err(BigBoardValidationError("Height must be a valid feet/inches combination."));
    }
    if (entry.weight <= 0) {
      return Err(BigBoardValidationError("Weight must be a positive number in pounds."));
    }
    if (entry.rank <= 0 || entry.posRank <= 0) {
      return Err(BigBoardValidationError("Rank and position rank must be positive integers."));
    }
    return Ok(undefined);
  }

  private validateWriteupForPublication(entry: BigBoardEntry): Result<void, BigBoardError> {
    if (!entry.writeup.strengths || !entry.writeup.weaknesses || !entry.writeup.rundown) {
      return Err(BigBoardValidationError("Strengths, weaknesses, and rundown are required before publishing a player writeup."));
    }
    return Ok(undefined);
  }

  private validatePublishedBigBoardEntries(entries: BigBoardEntry[]): Result<void, BigBoardError> {
    const entryIds = new Set<string>();
    const publishedPlayerInfo = entries.filter((entry) => entry.playerInfoPublished);
    const ranks = new Map<number, string>();
    const positionRanks = new Map<string, string>();

    for (const entry of entries) {
      if (entryIds.has(entry.id)) {
        return Err(BigBoardValidationError(`Big board entry id "${entry.id}" is duplicated.`));
      }
      entryIds.add(entry.id);
    }

    for (const entry of publishedPlayerInfo) {
      const playerInfoValidation = this.validatePlayerInfoForPublication(entry);
      if (playerInfoValidation.ok === false) {
        return Err(playerInfoValidation.value);
      }
      if (entry.rank !== null) {
        const existing = ranks.get(entry.rank);
        if (existing && existing !== entry.id) {
          return Err(BigBoardValidationError(`Overall rank ${entry.rank} is already used by another player.`));
        }
        ranks.set(entry.rank, entry.id);
      }
      if (entry.position && entry.posRank !== null) {
        const positionRankKey = `${entry.position}:${entry.posRank}`;
        const existing = positionRanks.get(positionRankKey);
        if (existing && existing !== entry.id) {
          return Err(BigBoardValidationError(`${entry.position}${entry.posRank} is already used by another player at the same position.`));
        }
        positionRanks.set(positionRankKey, entry.id);
      }
    }

    for (const entry of entries.filter((entry) => entry.writeupPublished)) {
      const writeupValidation = this.validateWriteupForPublication(entry);
      if (writeupValidation.ok === false) {
        return Err(writeupValidation.value);
      }
    }

    return Ok(undefined);
  }

  private playerInfoChanged(existing: BigBoardEntry, next: BigBoardEntry): boolean {
    return existing.playerName !== next.playerName ||
      existing.school !== next.school ||
      existing.position !== next.position ||
      existing.rank !== next.rank ||
      existing.posRank !== next.posRank ||
      existing.weight !== next.weight ||
      existing.height?.feet !== next.height?.feet ||
      existing.height?.inches !== next.height?.inches;
  }

  private writeupChanged(existing: BigBoardEntry, next: BigBoardEntry): boolean {
    return existing.writeup.strengths !== next.writeup.strengths ||
      existing.writeup.weaknesses !== next.writeup.weaknesses ||
      existing.writeup.rundown !== next.writeup.rundown;
  }

  private validateCommentInput(input: CreateCommentInput): Result<void, ArticleError> {
    if (!input.userId || !input.userName || !input.text) {
      return Err(ArticleValidationError("User, user name, and comment text are required."));
    }
    if (input.userId.trim() === "" || input.userName.trim() === "" || input.text.trim() === "") {
      return Err(ArticleValidationError("User, user name, and comment text cannot be empty."));
    }
    if (input.text.length > COMMENT_TEXT_MAX_LENGTH) {
      return Err(ArticleValidationError(`Comment text cannot be more than ${COMMENT_TEXT_MAX_LENGTH} characters.`));
    }
    return Ok(undefined);
  }

  private validateForumPostInput(input: ForumPostInput): Result<void, ForumPostError> {
    if (!input.userId || !input.userName || !input.content) {
      return Err(ForumPostValidationError("User and hot take content are required."));
    }
    if (input.userId.trim() === "" || input.userName.trim() === "" || input.content.trim() === "") {
      return Err(ForumPostValidationError("Hot take content cannot be empty."));
    }
    if (input.content.trim().length > HOT_TAKE_MAX_LENGTH) {
      return Err(ForumPostValidationError(`Hot takes cannot be more than ${HOT_TAKE_MAX_LENGTH} characters.`));
    }
    return Ok(undefined);
  }

  private validateForumCommentInput(input: CreateCommentInput): Result<void, ForumPostError> {
    if (!input.userId || !input.userName || !input.text) {
      return Err(ForumPostValidationError("User, user name, and comment text are required."));
    }
    if (input.userId.trim() === "" || input.userName.trim() === "" || input.text.trim() === "") {
      return Err(ForumPostValidationError("User, user name, and comment text cannot be empty."));
    }
    if (input.text.length > COMMENT_TEXT_MAX_LENGTH) {
      return Err(ForumPostValidationError(`Comment text cannot be more than ${COMMENT_TEXT_MAX_LENGTH} characters.`));
    }
    return Ok(undefined);
  }
  
  private prepareArticleInput(input: CreateArticleInput): Result<CreateArticleInput, ArticleError> {
    const sanitizedInput: CreateArticleInput = {
      ...input,
      title: input.title.trim(),
      author: input.author.trim(),
      writeup: input.writeup.trim(),
      tags: this.normalizeArticleTags(input.tags),
      content: input.content ? this.sanitizeArticleContent(input.content) : input.content,
    };
    const validation = this.validateArticleInput(sanitizedInput);
    if (validation.ok === false) {
      return Err(validation.value);
    }
    return Ok(sanitizedInput);
  }

  async previewArticle(input: CreateArticleInput): Promise<Result<Article, ArticleError>> {
    const prepared = this.prepareArticleInput(input);
    if (prepared.ok === false) {
      return Err(prepared.value);
    }

    return Ok({
      id: "preview",
      title: prepared.value.title,
      published: prepared.value.published ?? false,
      author: prepared.value.author,
      writeup: prepared.value.writeup,
      tags: prepared.value.tags,
      publicationDate: prepared.value.publicationDate,
      content: prepared.value.content,
      imageUrl: prepared.value.imageUrl ?? this.defaultArticleImageUrl(),
      comments: [],
      likes: 0,
      likedByUserIds: [],
    });
  }
  
  async createArticle(input: CreateArticleInput): Promise<Result<Article, ArticleError>> {
    const prepared = this.prepareArticleInput(input);
    if (prepared.ok === false) {
      return Err(prepared.value);
    }

    for (let attempt = 0; attempt < ARTICLE_ID_MAX_ATTEMPTS; attempt += 1) {
      const article: Article = {
        id: this.createArticleId(),
        title: prepared.value.title,
        published: prepared.value.published ?? true,
        author: prepared.value.author,
        writeup: prepared.value.writeup,
        tags: prepared.value.tags,
        publicationDate: prepared.value.publicationDate,
        content: prepared.value.content,
        imageUrl: prepared.value.imageUrl ?? this.defaultArticleImageUrl(),
        comments: [],
        likes: 0,
        likedByUserIds: []
      };
      const result = await this.repository.createArticle(article);
      if (result.ok === true) {
        return Ok(result.value);
      }
      if (result.value.name !== "DuplicateArticle") {
        return Err(result.value);
      }
    }

    return Err(UnknownArticleError("Unable to generate a unique article id."));
  }

  private mergeArticleUpdate(existing: Article, prepared: CreateArticleInput): Article {
    return {
      ...existing,
      title: prepared.title,
      published: prepared.published ?? existing.published,
      author: prepared.author,
      writeup: prepared.writeup,
      tags: prepared.tags,
      publicationDate: prepared.publicationDate,
      content: prepared.content,
      imageUrl: prepared.imageUrl ?? existing.imageUrl ?? this.defaultArticleImageUrl(),
    };
  }

  async previewUpdatedArticle(id: string, input: CreateArticleInput): Promise<Result<Article, ArticleError>> {
    const existing = await this.repository.getArticle(id);
    if (existing.ok === false) {
      return Err(existing.value);
    }

    const prepared = this.prepareArticleInput(input);
    if (prepared.ok === false) {
      return Err(prepared.value);
    }

    return Ok(this.mergeArticleUpdate(existing.value, prepared.value));
  }

  async updateArticle(id: string, input: CreateArticleInput): Promise<Result<Article, ArticleError>> {
    const preview = await this.previewUpdatedArticle(id, input);
    if (preview.ok === false) {
      return Err(preview.value);
    }

    return await this.repository.updateArticle(preview.value);
  }

  async createBigBoardEntry(input: BigBoardEntryInput): Promise<Result<BigBoardEntry, BigBoardError>> {
    const key = this.normalizeBigBoardKey(input.year, input.creator);
    if (key.ok === false) {
      return Err(key.value);
    }
    const entry = this.normalizeBigBoardEntry(input);
    entry.playerInfoPublished = input.playerInfoPublished ?? true;
    entry.writeupPublished = input.writeupPublished ?? false;

    let board = await this.repository.getBigBoard(key.value.year, key.value.creator);
    if (board.ok === false && board.value.name === "BigBoardNotFound") {
      const createYearResult = await this.repository.createBigBoardYear(key.value.year);
      if (createYearResult.ok === false && createYearResult.value.name !== "DuplicateBigBoardYear") {
        return Err(createYearResult.value);
      }
      board = await this.repository.getBigBoard(key.value.year, key.value.creator);
    }
    if (board.ok === false) {
      return Err(board.value);
    }

    const validation = this.validatePublishedBigBoardEntries([...board.value.entries, entry]);
    if (validation.ok === false) {
      return Err(validation.value);
    }

    const result = await this.repository.createBigBoardEntry(key.value.year, key.value.creator, entry);
    if (result.ok === false) {
      return Err(result.value);
    }
    return Ok(result.value);
  }

  async saveBigBoardEntries(input: SaveBigBoardEntriesInput): Promise<Result<BigBoard, BigBoardError>> {
    const key = this.normalizeBigBoardKey(input.year, input.creator);
    if (key.ok === false) {
      return Err(key.value);
    }

    const existingBoard = await this.getBigBoard(key.value.year, key.value.creator);
    if (existingBoard.ok === false) {
      return Err(existingBoard.value);
    }

    const existingById = new Map(existingBoard.value.entries.map((entry) => [entry.id, entry]));
    const entries = input.entries.map((entryInput) => {
      const existing = entryInput.id ? existingById.get(entryInput.id) : undefined;
      const next = this.normalizeBigBoardEntry(entryInput, existing);
      if (existing) {
        next.playerInfoPublished = existing.playerInfoPublished && !this.playerInfoChanged(existing, next);
        next.writeupPublished = existing.writeupPublished && !this.writeupChanged(existing, next);
      }
      return next;
    });

    const validation = this.validatePublishedBigBoardEntries(entries);
    if (validation.ok === false) {
      return Err(validation.value);
    }

    return await this.repository.replaceBigBoardEntries(key.value.year, key.value.creator, entries);
  }

  async publishBigBoardEntryPlayerInfo(year: number | undefined, creator: BigBoardCreator | undefined, entryId: string): Promise<Result<BigBoardEntry, BigBoardError>> {
    const key = this.normalizeBigBoardKey(year, creator);
    if (key.ok === false) {
      return Err(key.value);
    }

    const board = await this.getBigBoard(key.value.year, key.value.creator);
    if (board.ok === false) {
      return Err(board.value);
    }
    const entry = board.value.entries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      return Err(BigBoardValidationError(`Big board entry with id "${entryId}" was not found.`));
    }
    const next = { ...entry, playerInfoPublished: true };
    const validation = this.validatePublishedBigBoardEntries(board.value.entries.map((candidate) => candidate.id === entryId ? next : candidate));
    if (validation.ok === false) {
      return Err(validation.value);
    }
    return await this.repository.updateBigBoardEntry(key.value.year, key.value.creator, next);
  }

  async publishBigBoardEntryWriteup(year: number | undefined, creator: BigBoardCreator | undefined, entryId: string): Promise<Result<BigBoardEntry, BigBoardError>> {
    const key = this.normalizeBigBoardKey(year, creator);
    if (key.ok === false) {
      return Err(key.value);
    }

    const entry = await this.repository.getBigBoardEntryById(key.value.year, key.value.creator, entryId);
    if (entry.ok === false) {
      return Err(entry.value);
    }
    const validation = this.validateWriteupForPublication(entry.value);
    if (validation.ok === false) {
      return Err(validation.value);
    }
    return await this.repository.updateBigBoardEntry(key.value.year, key.value.creator, {
      ...entry.value,
      writeupPublished: true,
    });
  }

  async deleteArticle(id: string): Promise<Result<void, ArticleError>> {
    return await this.repository.deleteArticle(id);
  }

  async deleteBigBoardEntry(year: number | undefined, creator: BigBoardCreator | undefined, playerName: string): Promise<Result<void, BigBoardError>> {
    const key = this.normalizeBigBoardKey(year, creator);
    if (key.ok === false) {
      return Err(key.value);
    }
    return await this.repository.deleteBigBoardEntry(key.value.year, key.value.creator, playerName);
  }

  async getBigBoard(year?: number, creator?: BigBoardCreator): Promise<Result<BigBoard, BigBoardError>> {
    const key = this.normalizeBigBoardKey(year, creator);
    if (key.ok === false) {
      return Err(key.value);
    }

    const result = await this.repository.getBigBoard(key.value.year, key.value.creator);
    if (result.ok === false && result.value.name === "BigBoardNotFound") {
      const createYearResult = await this.repository.createBigBoardYear(key.value.year);
      if (createYearResult.ok === false && createYearResult.value.name !== "DuplicateBigBoardYear") {
        return Err(createYearResult.value);
      }
      return await this.repository.getBigBoard(key.value.year, key.value.creator);
    }
    return result;
  }

  async getBigBoardYears(): Promise<Result<number[], BigBoardError>> {
    return await this.repository.getBigBoardYears();
  }

  async getArticles(published = true): Promise<Result<Article[], ArticleError>> {
    return await this.repository.getArticles(published);
  }

  async getArticleTags(): Promise<Result<string[], ArticleError>> {
    return await this.repository.getArticleTags();
  }

  async getBigBoardEntry(year: number | undefined, creator: BigBoardCreator | undefined, playerName: string): Promise<Result<BigBoardEntry, BigBoardError>> {
    const key = this.normalizeBigBoardKey(year, creator);
    if (key.ok === false) {
      return Err(key.value);
    }
    return await this.repository.getBigBoardEntry(key.value.year, key.value.creator, playerName);
  }

  async getArticle(id: string): Promise<Result<Article, ArticleError>> {
    return await this.repository.getArticle(id);
  }

  async getFilteredArticles(filter: ArticleFilter): Promise<Result<Article[], ArticleError>> {
    return await this.repository.getFilteredArticles(filter);
  }

  async commentByArticleId(input: CreateCommentInput): Promise<Result<Comment, ArticleError>> {
    const validation = this.validateCommentInput(input);
    if (validation.ok === false) {
      return Err(validation.value);
    }

    const comment: Comment = {
      id: this.createCommentId(),
      userId: input.userId.trim(),
      userName: input.userName.trim(),
      text: input.text.trim(),
      createdAt: new Date(),
      likes: 0,
      likedByUserIds: [],
      replies: []
    };
    if (!input.articleId) {
      return Err(ArticleValidationError("Article id is required for top-level comments."));
    }

    return await this.repository.commentByArticleId(input.articleId.trim(), comment);
  }

  async commentReplyByCommentId(commentId: string, reply: CreateCommentInput): Promise<Result<Comment, ArticleError>> {
    const validation = this.validateCommentInput(reply);
    if (validation.ok === false) {
      return Err(validation.value);
    }

    const comment: Comment = {
      id: this.createCommentId(),
      userId: reply.userId.trim(),
      userName: reply.userName.trim(),
      text: reply.text.trim(),
      createdAt: new Date(),
      likes: 0,
      likedByUserIds: [],
      replies: []
    };

    return await this.repository.commentReplyByCommentId(commentId.trim(), comment);
  }

  async likeByArticleId(articleId: string, userId: string): Promise<Result<Article, ArticleError>> {
    if (!articleId || articleId.trim() === "") {
      return Err(ArticleValidationError("Article id is required."));
    }
    if (!userId || userId.trim() === "") {
      return Err(ArticleValidationError("User id is required."));
    }

    return await this.repository.likeByArticleId(articleId.trim(), userId.trim());
  }

  async likeByCommentId(commentId: string, userId: string): Promise<Result<Comment, ArticleError>> {
    if (!commentId || commentId.trim() === "") {
      return Err(ArticleValidationError("Comment id is required."));
    }
    if (!userId || userId.trim() === "") {
      return Err(ArticleValidationError("User id is required."));
    }

    return await this.repository.likeByCommentId(commentId.trim(), userId.trim());
  }

  async deleteComment(commentId: string): Promise<Result<void, ArticleError>> {
    if (!commentId || commentId.trim() === "") {
      return Err(ArticleValidationError("Comment id is required."));
    }

    return await this.repository.deleteComment(commentId.trim());
  }

  async createForumPost(input: ForumPostInput): Promise<Result<ForumPost, ForumPostError>> {
    const prepared: ForumPostInput = {
      content: typeof input.content === "string" ? input.content.trim() : input.content,
      userId: typeof input.userId === "string" ? input.userId.trim() : input.userId,
      userName: typeof input.userName === "string" ? input.userName.trim() : input.userName,
    };
    const validation = this.validateForumPostInput(prepared);
    if (validation.ok === false) {
      return Err(validation.value);
    }

    for (let attempt = 0; attempt < ARTICLE_ID_MAX_ATTEMPTS; attempt += 1) {
      const post: ForumPost = {
        id: this.createRandomId(ARTICLE_ID_LENGTH),
        userId: prepared.userId,
        userName: prepared.userName,
        content: prepared.content,
        createdAt: new Date(),
        likes: 0,
        likedByUserIds: [],
        comments: [],
      };
      const result = await this.repository.createForumPost(post);
      if (result.ok === true) {
        return Ok(result.value);
      }
      if (result.value.name !== "DuplicateForumPost") {
        return Err(result.value);
      }
    }

    return Err(UnknownForumPostError("Unable to generate a unique hot take id."));
  }

  async getForumPosts(): Promise<Result<ForumPost[], ForumPostError>> {
    return await this.repository.getForumPosts();
  }

  async getForumPost(postId: string): Promise<Result<ForumPost, ForumPostError>> {
    if (!postId || postId.trim() === "") {
      return Err(ForumPostValidationError("Hot take id is required."));
    }
    return await this.repository.getForumPost(postId.trim());
  }

  async likeByForumPostId(postId: string, userId: string): Promise<Result<ForumPost, ForumPostError>> {
    if (!postId || postId.trim() === "") {
      return Err(ForumPostValidationError("Hot take id is required."));
    }
    if (!userId || userId.trim() === "") {
      return Err(ForumPostValidationError("User id is required."));
    }
    return await this.repository.likeByForumPostId(postId.trim(), userId.trim());
  }

  async commentByForumPostId(postId: string, input: CreateCommentInput): Promise<Result<Comment, ForumPostError>> {
    if (!postId || postId.trim() === "") {
      return Err(ForumPostValidationError("Hot take id is required."));
    }
    const validation = this.validateForumCommentInput(input);
    if (validation.ok === false) {
      return Err(validation.value);
    }

    const comment: Comment = {
      id: this.createCommentId(),
      userId: input.userId.trim(),
      userName: input.userName.trim(),
      text: input.text.trim(),
      createdAt: new Date(),
      likes: 0,
      likedByUserIds: [],
      replies: [],
    };

    return await this.repository.commentByForumPostId(postId.trim(), comment);
  }

  async getFilteredForumPosts(filter: ForumPostFilter): Promise<Result<ForumPost[], ForumPostError>> {
    return await this.repository.getFilteredForumPosts(filter);
  }

  async deleteForumPost(postId: string): Promise<Result<void, ForumPostError>> {
    if (!postId || postId.trim() === "") {
      return Err(ForumPostValidationError("Hot take id is required."));
    }
    return await this.repository.deleteForumPost(postId.trim());
  }
}

export function CreateOnDraftService(repository: IOnDraftRepository): IOnDraftService {
  return new OnDraftService(repository);
}
