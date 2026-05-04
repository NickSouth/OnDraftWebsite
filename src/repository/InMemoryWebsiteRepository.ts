import { Err, Ok, Result } from "../lib/result";
import { Article, BigBoard, BigBoardEntry } from "../model/WebsiteContent";
import { ArticleNotFound, DuplicatePlayer, DuplicateArticle, type ArticleError, type BigBoardError, type IWebsiteRepository, PlayerNotFound } from "./WebsiteRepository";


class InMemoryWebsiteRepository implements IWebsiteRepository {
  private bigBoard: BigBoard = [];
  private articles: Article[] = [];

  async getBigBoard(): Promise<Result<BigBoard, BigBoardError>> {
    return Ok(this.bigBoard);
  }

  async getArticles(): Promise<Result<Article[], ArticleError>> {
    return Ok(this.articles);
  }

  async createArticle(article: Article): Promise<Result<Article, ArticleError>> {
    if (this.articles.find(a => a.title === article.title)) {
      return Err(DuplicateArticle(`Article with title "${article.title}" already exists.`));
    }
    this.articles.push(article);
    return Ok(article);
  }

  async createBigBoardEntry(entry: BigBoardEntry): Promise<Result<BigBoardEntry, BigBoardError>> {
    if (this.bigBoard.find(e => e.playerName === entry.playerName)) {
      return Err(DuplicatePlayer(`Player with name "${entry.playerName}" already exists in the big board.`));
    }
    this.bigBoard.push(entry);
    return Ok(entry);
  }

  async deleteArticle(title: string): Promise<Result<void, ArticleError>> {
    const index = this.articles.findIndex(a => a.title === title);
    if (index === -1) {
      return Err(ArticleNotFound(`Article with title "${title}" not found.`));
    }
    this.articles.splice(index, 1);
    return Ok(undefined);
  }

  async deleteBigBoardEntry(playerName: string): Promise<Result<void, BigBoardError>> {
    const index = this.bigBoard.findIndex(e => e.playerName === playerName);
    if (index === -1) {
      return Err(PlayerNotFound(`Player with name "${playerName}" not found in the big board.`));
    }
    this.bigBoard.splice(index, 1);
    return Ok(undefined);
  }

  async getBigBoardEntry(playerName: string): Promise<Result<BigBoardEntry, BigBoardError>> {
    const entry = this.bigBoard.find(e => e.playerName === playerName);
    if (!entry) {
      return Err(PlayerNotFound(`Player with name "${playerName}" not found in the big board.`));
    }
    return Ok(entry);
  }

  async getArticle(title: string): Promise<Result<Article, ArticleError>> {
    const article = this.articles.find(a => a.title === title);
    if (!article) {
      return Err(ArticleNotFound(`Article with title "${title}" not found.`));
    }
    return Ok(article);
  }
}

export function CreateInMemoryWebsiteRepository(): IWebsiteRepository {
  return new InMemoryWebsiteRepository();
}
