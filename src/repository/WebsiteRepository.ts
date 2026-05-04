import { Result, Err, Ok } from "../lib/result";
import { type BigBoard, Article, BigBoardEntry, ArticleFilter, Comment } from "../model/WebsiteContent";

export type BigBoardError = 
    | {name: "PlayerNotFound"; message: string} 
    | {name: "DuplicatePlayer"; message: string}
    | {name: "DatabaseError"; message: string}
    | {name: "BigBoardValidationError"; message: string}
    | {name: "UnknownBigBoardError"; message: string};

export type ArticleError = 
    | {name: "ArticleNotFound"; message: string} 
    | {name: "CommentNotFound"; message: string} 
    | {name: "DuplicateArticle"; message: string}
    | {name: "DatabaseError"; message: string}
    | {name: "ArticleValidationError"; message: string}
    | {name: "UnknownArticleError"; message: string};

export const ArticleNotFound = (message: string): ArticleError => ({ name: "ArticleNotFound", message });
export const CommentNotFound = (message: string): ArticleError => ({ name: "CommentNotFound", message });
export const PlayerNotFound = (message: string): BigBoardError => ({ name: "PlayerNotFound", message });
export const DuplicateArticle = (message: string): ArticleError => ({ name: "DuplicateArticle", message });
export const DuplicatePlayer = (message: string): BigBoardError => ({ name: "DuplicatePlayer", message });
export const DatabaseError = (message: string): ArticleError | BigBoardError => ({ name: "DatabaseError", message });
export const ArticleValidationError = (message: string): ArticleError => ({ name: "ArticleValidationError", message });
export const BigBoardValidationError = (message: string): BigBoardError => ({ name: "BigBoardValidationError", message });
export const UnknownArticleError = (message: string): ArticleError => ({ name: "UnknownArticleError", message });
export const UnknownBigBoardError = (message: string): BigBoardError => ({ name: "UnknownBigBoardError", message });

export interface IWebsiteRepository {
    getBigBoard(): Promise<Result<BigBoard, BigBoardError>>;
    getArticles(published?: boolean): Promise<Result<Article[], ArticleError>>;
    getArticleTags(): Promise<Result<string[], ArticleError>>;
    createArticle(article: Article): Promise<Result<Article, ArticleError>>;
    createBigBoardEntry(entry: BigBoardEntry): Promise<Result<BigBoardEntry, BigBoardError>>;
    deleteArticle(id: string): Promise<Result<void, ArticleError>>;
    deleteBigBoardEntry(playerName: string): Promise<Result<void, BigBoardError>>;
    getBigBoardEntry(playerName: string): Promise<Result<BigBoardEntry, BigBoardError>>;
    getArticle(id: string): Promise<Result<Article, ArticleError>>;
    getFilteredArticles(filter: ArticleFilter): Promise<Result<Article[], ArticleError>>;
    commentByArticleId(articleId: string, comment: Comment): Promise<Result<Comment, ArticleError>>;
    likeByArticleId(articleId: string, userId: string): Promise<Result<Article, ArticleError>>;
    likeByCommentId(commentId: string, userId: string): Promise<Result<Comment, ArticleError>>;
    deleteComment(commentId: string): Promise<Result<void, ArticleError>>;
}
