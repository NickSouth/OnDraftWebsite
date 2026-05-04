import { randomInt } from "node:crypto";
import { Err, Ok, Result } from "../lib/result";
import sanitizeHtml from "sanitize-html";
import { Article, ArticleContent, BigBoard, BigBoardEntry, Position, Height, ArticleFilter } from "../model/WebsiteContent";
import { UnknownArticleError, ArticleError,  BigBoardError, IWebsiteRepository, ArticleValidationError, BigBoardValidationError } from "../repository/WebsiteRepository";

const ARTICLE_PDF_MAX_BYTES = 5 * 1024 * 1024;
const ARTICLE_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ARTICLE_ID_LENGTH = 5;
const ARTICLE_ID_MAX_ATTEMPTS = 10;

export interface CreateArticleInput {
  title: string;
  author: string;
  publicationDate: Date;
  content: ArticleContent;
  imageUrl?: string;
}

export interface BigBoardEntryInput {
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

export interface IWebsiteService {
  createArticle(input: CreateArticleInput): Promise<Result<Article, ArticleError>>;
  createBigBoardEntry(input: BigBoardEntryInput): Promise<Result<BigBoardEntry, BigBoardError>>;
  deleteArticle(id: string): Promise<Result<void, ArticleError>>;
  deleteBigBoardEntry(playerName: string): Promise<Result<void, BigBoardError>>;
  getBigBoard(): Promise<Result<BigBoard, BigBoardError>>;
  getArticles(): Promise<Result<Article[], ArticleError>>;
  getBigBoardEntry(playerName: string): Promise<Result<BigBoardEntry, BigBoardError>>;
  getArticle(id: string): Promise<Result<Article, ArticleError>>;
  getFilteredArticles(filter: ArticleFilter): Promise<Result<Article[], ArticleError>>;
}

class WebsiteService implements IWebsiteService {
  constructor(private readonly repository: IWebsiteRepository) {}

  private createArticleId(): string {
    let id = "";
    for (let index = 0; index < ARTICLE_ID_LENGTH; index += 1) {
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
    if (!input.title || !input.author || !input.publicationDate || !input.content) {
      return Err(ArticleValidationError("All fields except imageUrl are required."));
    }
    if (input.title.trim() === "" || input.author.trim() === "") {
      return Err(ArticleValidationError("Title and author cannot be empty."));
    }
    if (isNaN(input.publicationDate.getTime())) {
      return Err(ArticleValidationError("Invalid publication date."));
    }
    if (input.imageUrl && !/^\/uploads\/articles\/.+\.(jpg|jpeg|png|gif|webp)$/.test(input.imageUrl)) {
      return Err(ArticleValidationError("Invalid image upload path."));
    }
    if (input.publicationDate > new Date()) {
      return Err(ArticleValidationError("Publication date cannot be in the future."));
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
  
  async createArticle(input: CreateArticleInput): Promise<Result<Article, ArticleError>> {
    const sanitizedInput: CreateArticleInput = {
      ...input,
      content: input.content ? this.sanitizeArticleContent(input.content) : input.content,
    };
    const validation = this.validateArticleInput(sanitizedInput);
    if (validation.ok === false) {
      return Err(validation.value);
    }

    for (let attempt = 0; attempt < ARTICLE_ID_MAX_ATTEMPTS; attempt += 1) {
      const article: Article = {
        id: this.createArticleId(),
        title: sanitizedInput.title,
        author: sanitizedInput.author,
        publicationDate: sanitizedInput.publicationDate,
        content: sanitizedInput.content,
        imageUrl: sanitizedInput.imageUrl
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

  async createBigBoardEntry(input: BigBoardEntryInput): Promise<Result<BigBoardEntry, BigBoardError>> {
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
    const result = await this.repository.createBigBoardEntry(entry);
    if (result.ok === false) {
      return Err(result.value);
    }
    return Ok(result.value);
  }

  async deleteArticle(id: string): Promise<Result<void, ArticleError>> {
    return await this.repository.deleteArticle(id);
  }

  async deleteBigBoardEntry(playerName: string): Promise<Result<void, BigBoardError>> {
    return await this.repository.deleteBigBoardEntry(playerName);
  }

  async getBigBoard(): Promise<Result<BigBoard, BigBoardError>> {
    return await this.repository.getBigBoard();
  }

  async getArticles(): Promise<Result<Article[], ArticleError>> {
    return await this.repository.getArticles();
  }

  async getBigBoardEntry(playerName: string): Promise<Result<BigBoardEntry, BigBoardError>> {
    return await this.repository.getBigBoardEntry(playerName);
  }

  async getArticle(id: string): Promise<Result<Article, ArticleError>> {
    return await this.repository.getArticle(id);
  }

  async getFilteredArticles(filter: ArticleFilter): Promise<Result<Article[], ArticleError>> {
    return await this.repository.getFilteredArticles(filter);
  }
}

export function CreateWebsiteService(repository: IWebsiteRepository): IWebsiteService {
  return new WebsiteService(repository);
}
