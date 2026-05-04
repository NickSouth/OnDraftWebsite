import { Err, Ok, Result } from "../lib/result";
import { Article, BigBoard, BigBoardEntry, Position, Height } from "../model/WebsiteContent";
import { UnknownArticleError, ArticleError,  BigBoardError, IWebsiteRepository, ArticleValidationError, BigBoardValidationError } from "../repository/WebsiteRepository";

export interface CreateArticleInput {
  title: string;
  author: string;
  publicationDate: Date;
  content: string;
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
  deleteArticle(title: string): Promise<Result<void, ArticleError>>;
  deleteBigBoardEntry(playerName: string): Promise<Result<void, BigBoardError>>;
  getBigBoard(): Promise<Result<BigBoard, BigBoardError>>;
  getArticles(): Promise<Result<Article[], ArticleError>>;
  getBigBoardEntry(playerName: string): Promise<Result<BigBoardEntry, BigBoardError>>;
  getArticle(title: string): Promise<Result<Article, ArticleError>>;
}

class WebsiteService implements IWebsiteService {
  constructor(private readonly repository: IWebsiteRepository) {}

  private validateArticleInput(input: CreateArticleInput): Result<void, ArticleError> {
    if (!input.title || !input.author || !input.publicationDate || !input.content) {
      return Err(ArticleValidationError("All fields except imageUrl are required."));
    }
    if (input.title.trim() === "" || input.author.trim() === "" || input.content.trim() === "") {
      return Err(ArticleValidationError("Title, author, and content cannot be empty."));
    }
    if (isNaN(input.publicationDate.getTime())) {
      return Err(ArticleValidationError("Invalid publication date."));
    }
    if (input.imageUrl && !/^https?:\/\/.+\.(jpg|jpeg|png|gif|bmp|webp)$/.test(input.imageUrl)) {
      return Err(ArticleValidationError("Invalid image URL format."));
    }
    if (input.publicationDate > new Date()) {
      return Err(ArticleValidationError("Publication date cannot be in the future."));
    }
    return Ok(undefined);
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
    const validation = this.validateArticleInput(input);
    if (!validation.ok) {
      return Err(validation.value);
    }

    const article: Article = {
      title: input.title,
      author: input.author,
      publicationDate: input.publicationDate,
      content: input.content,
      imageUrl: input.imageUrl
    };
    const result = await this.repository.createArticle(article);
    if (!result.ok) {
      return Err(result.value);
    }
    return Ok(result.value);
  }

  async createBigBoardEntry(input: BigBoardEntryInput): Promise<Result<BigBoardEntry, BigBoardError>> {
    const validation = this.validateBigBoardEntry(input);
    if (!validation.ok) {
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
    if (!result.ok) {
      return Err(result.value);
    }
    return Ok(result.value);
  }

  async deleteArticle(title: string): Promise<Result<void, ArticleError>> {
    return await this.repository.deleteArticle(title);
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

  async getArticle(title: string): Promise<Result<Article, ArticleError>> {
    return await this.repository.getArticle(title);
  }
}

export function CreateWebsiteService(repository: IWebsiteRepository): IWebsiteService {
  return new WebsiteService(repository);
}
