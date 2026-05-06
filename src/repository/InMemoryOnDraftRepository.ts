import { Err, Ok, Result } from "../lib/result";
import { Article, ArticleFilter, BIG_BOARD_CREATORS, BigBoard, BigBoardCreator, BigBoardEntry, Comment, ForumPost, ForumPostFilter } from "../model/OnDraftContent";
import { ArticleNotFound, BigBoardNotFound, CommentNotFound, DuplicateBigBoardYear, DuplicatePlayer, DuplicateArticle, DuplicateForumPost, type ArticleError, type BigBoardError, type IOnDraftRepository, PlayerNotFound, ForumPostError, ForumPostNotFound } from "./OnDraftRepository";


class InMemoryOnDraftRepository implements IOnDraftRepository {
  private bigBoards: BigBoard[] = [];
  private articles: Article[] = [];
  private forumPosts: ForumPost[] = [];
  constructor() {
    this.createBigBoardYearSync(new Date().getFullYear());
  }

  private findBigBoard(year: number, creator: BigBoardCreator): BigBoard | undefined {
    return this.bigBoards.find((bigBoard) => bigBoard.year === year && bigBoard.creator === creator);
  }

  private createBigBoardYearSync(year: number): void {
    BIG_BOARD_CREATORS.forEach((creator) => {
      this.bigBoards.push({ year, creator, entries: [] });
    });
  }

  private findCommentById(comments: Comment[], commentId: string): Comment | undefined {
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

  private deleteCommentById(comments: Comment[], commentId: string): boolean {
    const commentIndex = comments.findIndex((entry) => entry.id === commentId);
    if (commentIndex !== -1) {
      comments.splice(commentIndex, 1);
      return true;
    }

    return comments.some((comment) => this.deleteCommentById(comment.replies, commentId));
  }

  async getBigBoard(year: number, creator: BigBoardCreator): Promise<Result<BigBoard, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    return Ok(bigBoard);
  }

  async createBigBoardYear(year: number): Promise<Result<void, BigBoardError>> {
    if (this.bigBoards.find((bb) => bb.year === year)) {
      return Err(DuplicateBigBoardYear(`Big boards for ${year} already exist.`));
    }
    this.createBigBoardYearSync(year);
    return Ok(undefined);
  }

  async getBigBoardYears(): Promise<Result<number[], BigBoardError>> {
    const years = new Set(this.bigBoards.map((bigBoard) => bigBoard.year));
    return Ok([...years].sort((first, second) => second - first));
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

  async createBigBoardEntry(year: number, creator: BigBoardCreator, entry: BigBoardEntry): Promise<Result<BigBoardEntry, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    if (bigBoard.entries.find(e => e.id === entry.id)) {
      return Err(DuplicatePlayer(`Big board entry with id "${entry.id}" already exists in the ${year} ${creator} big board.`));
    }
    bigBoard.entries.push(entry);
    return Ok(entry);
  }

  async updateBigBoardEntry(year: number, creator: BigBoardCreator, entry: BigBoardEntry): Promise<Result<BigBoardEntry, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    const index = bigBoard.entries.findIndex(e => e.id === entry.id);
    if (index === -1) {
      return Err(PlayerNotFound(`Big board entry with id "${entry.id}" was not found in the ${year} ${creator} big board.`));
    }
    bigBoard.entries[index] = entry;
    return Ok(entry);
  }

  async replaceBigBoardEntries(year: number, creator: BigBoardCreator, entries: BigBoardEntry[]): Promise<Result<BigBoard, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    bigBoard.entries = entries;
    return Ok(bigBoard);
  }

  async deleteArticle(id: string): Promise<Result<void, ArticleError>> {
    const index = this.articles.findIndex(a => a.id === id);
    if (index === -1) {
      return Err(ArticleNotFound(`Article with id "${id}" not found.`));
    }
    this.articles.splice(index, 1);
    return Ok(undefined);
  }

  async deleteBigBoardEntry(year: number, creator: BigBoardCreator, playerName: string): Promise<Result<void, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    const index = bigBoard.entries.findIndex(e => e.playerName === playerName);
    if (index === -1) {
      return Err(PlayerNotFound(`Player with name "${playerName}" not found in the ${year} ${creator} big board.`));
    }
    bigBoard.entries.splice(index, 1);
    return Ok(undefined);
  }

  async getBigBoardEntry(year: number, creator: BigBoardCreator, playerName: string): Promise<Result<BigBoardEntry, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    const entry = bigBoard.entries.find(e => e.playerName === playerName);
    if (!entry) {
      return Err(PlayerNotFound(`Player with name "${playerName}" not found in the ${year} ${creator} big board.`));
    }
    return Ok(entry);
  }

  async getBigBoardEntryById(year: number, creator: BigBoardCreator, entryId: string): Promise<Result<BigBoardEntry, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    const entry = bigBoard.entries.find(e => e.id === entryId);
    if (!entry) {
      return Err(PlayerNotFound(`Big board entry with id "${entryId}" was not found in the ${year} ${creator} big board.`));
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

  async commentReplyByCommentId(commentId: string, reply: Comment): Promise<Result<Comment, ArticleError>> {
    for (const article of this.articles) {
      const parentComment = this.findCommentById(article.comments, commentId);
      if (parentComment) {
        parentComment.replies.push(reply);
        return Ok(reply);
      }
    }
    return Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
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
      const comment = this.findCommentById(article.comments, commentId);
      if (comment) {
        comment.likes = this.toggleLike(comment.likedByUserIds, userId);
        return Ok(comment);
      }
    }

    return Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
  }

  async deleteComment(commentId: string): Promise<Result<void, ArticleError>> {
    for (const article of this.articles) {
      if (this.deleteCommentById(article.comments, commentId)) {
        return Ok(undefined);
      }
    }

    return Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
  }

  async createForumPost(post: ForumPost): Promise<Result<ForumPost, ForumPostError>> {
    if (this.forumPosts.find((existingPost) => existingPost.id === post.id)) {
      return Err(DuplicateForumPost(`Hot take with id "${post.id}" already exists.`));
    }
    this.forumPosts.push(post);
    return Ok(post);
  }

  async getForumPosts(): Promise<Result<ForumPost[], ForumPostError>> {
    return Ok([...this.forumPosts].sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime()));
  }

  async getForumPost(postId: string): Promise<Result<ForumPost, ForumPostError>> {
    const post = this.forumPosts.find(p => p.id === postId);
    if (!post) {
      return Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
    }
    return Ok(post);
  }

  async likeByForumPostId(postId: string, userId: string): Promise<Result<ForumPost, ForumPostError>> {
    const post = this.forumPosts.find(p => p.id === postId);
    if (!post) {
      return Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
    }
    post.likes = this.toggleLike(post.likedByUserIds, userId);
    return Ok(post);
  }

  async commentByForumPostId(postId: string, comment: Comment): Promise<Result<Comment, ForumPostError>> {
    const post = this.forumPosts.find(p => p.id === postId);
    if (!post) {
      return Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
    }
    post.comments.push(comment);
    return Ok(comment);
  }

  async getFilteredForumPosts(filter: ForumPostFilter): Promise<Result<ForumPost[], ForumPostError>> {
    const filtered = this.forumPosts.filter((post) => {
      if (filter.userId && post.userId !== filter.userId) {
        return false;
      }
      if (filter.keyword) {
        const keyword = filter.keyword.toLowerCase();
        const searchText = `${post.userName} ${post.content} ${post.comments.map((comment) => comment.text).join(" ")}`;
        if (!searchText.toLowerCase().includes(keyword)) {
          return false;
        }
      }
      if (filter.dateRange) {
        const createdAt = post.createdAt.getTime();
        if (createdAt < filter.dateRange.from.getTime() || createdAt > filter.dateRange.to.getTime()) {
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
          : first.createdAt.getTime();
      const secondValue = sortBy === "likes"
        ? second.likes
        : sortBy === "comments"
          ? second.comments.length
          : second.createdAt.getTime();

      return (firstValue - secondValue) * direction;
    });

    return Ok(sorted);
  }

  async deleteForumPost(postId: string): Promise<Result<void, ForumPostError>> {
    const index = this.forumPosts.findIndex(p => p.id === postId);
    if (index === -1) {
      return Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
    }
    this.forumPosts.splice(index, 1);
    return Ok(undefined);
  }
}

export function CreateInMemoryOnDraftRepository(): IOnDraftRepository {
  return new InMemoryOnDraftRepository();
}
