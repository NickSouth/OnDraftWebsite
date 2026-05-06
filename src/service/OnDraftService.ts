import { randomInt } from "node:crypto";
import { Err, Ok, Result } from "../lib/result";
import sanitizeHtml from "sanitize-html";
import { Article, ArticleContent, BIG_BOARD_CREATORS, BigBoard, BigBoardCreator, BigBoardEntry, Position, ArticleFilter, Comment, ForumPost, ForumPostFilter } from "../model/OnDraftContent";
import { UnknownArticleError, UnknownForumPostError, ArticleError,  BigBoardError, IOnDraftRepository, ArticleValidationError, BigBoardValidationError, ForumPostError, ForumPostValidationError } from "../repository/OnDraftRepository";

const ARTICLE_PDF_MAX_BYTES = 5 * 1024 * 1024;
const ARTICLE_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ARTICLE_ID_LENGTH = 5;
const ARTICLE_ID_MAX_ATTEMPTS = 10;
const COMMENT_ID_LENGTH = 8;
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
  playerName: string;
  position: string;
  school: string;
  rank: number;
  posRank: number;
  writeup: string;
  age: number;
  height: {
    feet: number;
    inches: number;
  };
  weight: number;
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

  private validateBigBoardEntry(input: BigBoardEntryInput): Result<void, BigBoardError> {
    const validPositions = ["QB", "RB", "WR", "TE", "K", "OT", "OG", "C", "DE", "DT", "LB", "CB", "S"];
    if (!input.playerName || !input.position || !input.school || !input.writeup) {
      return Err(BigBoardValidationError("Player name, position, school, and writeup are required."));
    }
    if (input.playerName.trim() === "" || input.school.trim() === "" || input.writeup.trim() === "") {
      return Err(BigBoardValidationError("Player name, school, and writeup cannot be empty."));
    }
    if (!validPositions.includes(input.position)) {
      return Err(BigBoardValidationError(`Position must be one of: ${validPositions.join(", ")}`));
    }
    if (input.age <= 0) {
      return Err(BigBoardValidationError("Age must be a positive number."));
    }
    if (input.height.feet < 0 || input.height.inches < 0 || input.height.inches >= 12) {
      return Err(BigBoardValidationError("Height must be a valid feet/inches combination."));
    }
    if (input.weight <= 0) {
      return Err(BigBoardValidationError("Weight must be a positive number."));
    }
    return Ok(undefined);
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
    const validation = this.validateBigBoardEntry(input);
    if (validation.ok === false) {
      return Err(validation.value);
    }
    const entry: BigBoardEntry = {
      playerName: input.playerName,
      position: input.position as Position,
      school: input.school,
      rank: input.rank,
      posRank: input.posRank,
      writeup: input.writeup,
      age: input.age,
      height: {
        feet: input.height.feet,
        inches: input.height.inches
      },
      weight: input.weight
    };
    const result = await this.repository.createBigBoardEntry(key.value.year, key.value.creator, entry);
    if (result.ok === false && result.value.name === "BigBoardNotFound") {
      const createYearResult = await this.repository.createBigBoardYear(key.value.year);
      if (createYearResult.ok === false && createYearResult.value.name !== "DuplicateBigBoardYear") {
        return Err(createYearResult.value);
      }
      return await this.repository.createBigBoardEntry(key.value.year, key.value.creator, entry);
    }
    if (result.ok === false) {
      return Err(result.value);
    }
    return Ok(result.value);
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
