import { Result, Err, Ok } from "../lib/result";
import { type BigBoard, Article, BigBoardEntry } from "../model/WebsiteContent";

export type BigBoardError = 
    | {name: "PlayerNotFound"; message: string} 
    | {name: "DuplicatePlayer"; message: string}
    | {name: "DatabaseError"; message: string}
    | {name: "ValidationError"; message: string}
    | {name: "UnknownError"; message: string};

export type ArticleError = 
    | {name: "ArticleNotFound"; message: string} 
    | {name: "DuplicateArticle"; message: string}
    | {name: "DatabaseError"; message: string}
    | {name: "ValidationError"; message: string}
    | {name: "UnknownError"; message: string};

export const ArticleNotFound = (message: string): ArticleError => ({ name: "ArticleNotFound", message });
export const PlayerNotFound = (message: string): BigBoardError => ({ name: "PlayerNotFound", message });
export const DuplicateArticle = (message: string): ArticleError => ({ name: "DuplicateArticle", message });
export const DuplicatePlayer = (message: string): BigBoardError => ({ name: "DuplicatePlayer", message });
export const DatabaseError = (message: string): ArticleError | BigBoardError => ({ name: "DatabaseError", message });
export const ValidationError = (message: string): ArticleError | BigBoardError => ({ name: "ValidationError", message });
export const UnknownError = (message: string): ArticleError | BigBoardError => ({ name: "UnknownError", message });

export interface IWebsiteRepository {
    getBigBoard(): Promise<Result<BigBoard, BigBoardError>>;
    getArticles(): Promise<Result<Article[], ArticleError>>;
    createArticle(article: Article): Promise<Result<Article, ArticleError>>;
    createBigBoardEntry(entry: BigBoardEntry): Promise<Result<BigBoardEntry, BigBoardError>>;
    deleteArticle(title: string): Promise<Result<void, ArticleError>>;
    deleteBigBoardEntry(playerName: string): Promise<Result<void, BigBoardError>>;
    getBigBoardEntry(playerName: string): Promise<Result<BigBoardEntry, BigBoardError>>;
    getArticle(title: string): Promise<Result<Article, ArticleError>>;
}
