import { Err, Ok, Result } from "../lib/result";
import { Article, ArticleFilter, BigBoard, BigBoardEntry, Comment } from "../model/WebsiteContent";
import { ArticleNotFound, CommentNotFound, DuplicatePlayer, DuplicateArticle, type ArticleError, type BigBoardError, type IWebsiteRepository, PlayerNotFound } from "./WebsiteRepository";


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

    const sortBy = filter.sortBy ?? "date";
    const direction = filter.sortDirection === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((first, second) => {
      const firstValue = sortBy === "likes"
        ? first.likes
        : sortBy === "comments"
          ? first.comments.length
          : first.publicationDate.getTime();
      const secondValue = sortBy === "likes"
        ? second.likes
        : sortBy === "comments"
          ? second.comments.length
          : second.publicationDate.getTime();

      return (firstValue - secondValue) * direction;
    });

    return Ok(sorted);
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

  async updateArticle(article: Article): Promise<Result<Article, ArticleError>> {
    const articleIndex = this.articles.findIndex(a => a.id === article.id);
    if (articleIndex === -1) {
      return Err(ArticleNotFound(`Article with id "${article.id}" not found.`));
    }

    this.articles[articleIndex] = article;
    return Ok(article);
  }

  async commentByArticleId(articleId: string, comment: Comment): Promise<Result<Comment, ArticleError>> {
    const article = this.articles.find(a => a.id === articleId);
    if (!article) {
      return Err(ArticleNotFound(`Article with id "${articleId}" not found.`));
    }

    article.comments.push(comment);
    return Ok(comment);
  }

  private toggleLike(likedByUserIds: string[], userId: string): number {
    const likeIndex = likedByUserIds.indexOf(userId);
    if (likeIndex === -1) {
      likedByUserIds.push(userId);
    } else {
      likedByUserIds.splice(likeIndex, 1);
    }

    return likedByUserIds.length;
  }

  async likeByArticleId(articleId: string, userId: string): Promise<Result<Article, ArticleError>> {
    const article = this.articles.find(a => a.id === articleId);
    if (!article) {
      return Err(ArticleNotFound(`Article with id "${articleId}" not found.`));
    }

    article.likes = this.toggleLike(article.likedByUserIds, userId);
    return Ok(article);
  }

  async likeByCommentId(commentId: string, userId: string): Promise<Result<Comment, ArticleError>> {
    for (const article of this.articles) {
      const comment = article.comments.find((entry) => entry.id === commentId);
      if (comment) {
        comment.likes = this.toggleLike(comment.likedByUserIds, userId);
        return Ok(comment);
      }
    }

    return Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
  }

  async deleteComment(commentId: string): Promise<Result<void, ArticleError>> {
    for (const article of this.articles) {
      const commentIndex = article.comments.findIndex((entry) => entry.id === commentId);
      if (commentIndex !== -1) {
        article.comments.splice(commentIndex, 1);
        return Ok(undefined);
      }
    }

    return Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
  }
}

export function CreateInMemoryWebsiteRepository(): IWebsiteRepository {
  return new InMemoryWebsiteRepository();
}
