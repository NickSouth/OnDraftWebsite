import { Err, Ok, Result } from "../lib/result";
import { Article, ArticleFilter, BigBoard, BigBoardEntry } from "../model/WebsiteContent";
import { ArticleNotFound, DuplicatePlayer, DuplicateArticle, type ArticleError, type BigBoardError, type IWebsiteRepository, PlayerNotFound } from "./WebsiteRepository";


class InMemoryWebsiteRepository implements IWebsiteRepository {
  private bigBoard: BigBoard = [];
  private articles: Article[] = [];

  async getBigBoard(): Promise<Result<BigBoard, BigBoardError>> {
    return Ok(this.bigBoard);
  }

  async getArticles(published = true): Promise<Result<Article[], ArticleError>> {
    return Ok(this.articles.filter(article => article.published === published));
  }

  async getArticleTags(): Promise<Result<string[], ArticleError>> {
    const tags = new Set<string>();
    this.articles.forEach((article) => {
      (article.tags ?? []).forEach((tag) => tags.add(tag));
    });

    return Ok([...tags].sort((a, b) => a.localeCompare(b)));
  }

  async getFilteredArticles(filter: ArticleFilter): Promise<Result<Article[], ArticleError>> {
    const published = filter.published ?? true;
    const filtered = this.articles.filter(article => article.published === published).filter((article) => {
      if (filter.author && !article.author.toLowerCase().includes(filter.author.toLowerCase())) {
        return false;
      }

      if (filter.publicationDateRange) {
        const publishedAt = article.publicationDate.getTime();
        if (
          publishedAt < filter.publicationDateRange.from.getTime() ||
          publishedAt > filter.publicationDateRange.to.getTime()
        ) {
          return false;
        }
      }

      if (filter.keyword) {
        const keyword = filter.keyword.toLowerCase();
        const contentText = article.content.type === "plainText" || article.content.type === "html"
          ? article.content.type === "plainText"
            ? article.content.text
            : article.content.body
          : article.content.originalName;
        const searchText = `${article.title} ${article.author} ${article.writeup} ${(article.tags ?? []).join(" ")} ${contentText}`;
        if (!searchText.toLowerCase().includes(keyword)) {
          return false;
        }
      }

      if (filter.tags && filter.tags.length > 0) {
        const articleTags = (article.tags ?? []).map((tag) => tag.toLowerCase());
        const requiredTags = filter.tags.map((tag) => tag.toLowerCase());
        if (!requiredTags.every((tag) => articleTags.includes(tag))) {
          return false;
        }
      }

      return true;
    });

    return Ok(filtered);
  }

  async createArticle(article: Article): Promise<Result<Article, ArticleError>> {
    if (this.articles.find(a => a.id === article.id)) {
      return Err(DuplicateArticle(`Article with id "${article.id}" already exists.`));
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

  async deleteArticle(id: string): Promise<Result<void, ArticleError>> {
    const index = this.articles.findIndex(a => a.id === id);
    if (index === -1) {
      return Err(ArticleNotFound(`Article with id "${id}" not found.`));
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

  async getArticle(id: string): Promise<Result<Article, ArticleError>> {
    const article = this.articles.find(a => a.id === id);
    if (!article) {
      return Err(ArticleNotFound(`Article with id "${id}" not found.`));
    }
    return Ok(article);
  }
}

export function CreateInMemoryWebsiteRepository(): IWebsiteRepository {
  return new InMemoryWebsiteRepository();
}
