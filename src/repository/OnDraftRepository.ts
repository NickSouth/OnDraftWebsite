import { Result } from "../lib/result";
import { type BigBoard, Article, BigBoardCreator, BigBoardEntry, ArticleFilter, Comment, ForumPost, ForumPostFilter, DraftBoardFilter, Video, VideoQuery, ConsensusBigBoard, } from "../model/OnDraftContent";

export type BigBoardError = 
    | {name: "BigBoardNotFound"; message: string}
    | {name: "DuplicateBigBoardYear"; message: string}
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

export type ForumPostError =
    | {name: "ForumPostNotFound"; message: string}
    | {name: "CommentNotFound"; message: string}
    | {name: "DuplicateForumPost"; message: string}
    | {name: "ForumPostValidationError"; message: string}
    | {name: "DatabaseError"; message: string}
    | {name: "UnknownForumPostError"; message: string};

export const ArticleNotFound = (message: string): ArticleError => ({ name: "ArticleNotFound", message });
export const CommentNotFound = (message: string): ArticleError => ({ name: "CommentNotFound", message });
export const ForumPostNotFound = (message: string): ForumPostError => ({ name: "ForumPostNotFound", message });
export const ForumPostCommentNotFound = (message: string): ForumPostError => ({ name: "CommentNotFound", message });
export const DuplicateForumPost = (message: string): ForumPostError => ({ name: "DuplicateForumPost", message });
export const ForumPostValidationError = (message: string): ForumPostError => ({ name: "ForumPostValidationError", message });
export const UnknownForumPostError = (message: string): ForumPostError => ({ name: "UnknownForumPostError", message });
export const BigBoardNotFound = (message: string): BigBoardError => ({ name: "BigBoardNotFound", message });
export const DuplicateBigBoardYear = (message: string): BigBoardError => ({ name: "DuplicateBigBoardYear", message });
export const PlayerNotFound = (message: string): BigBoardError => ({ name: "PlayerNotFound", message });
export const DuplicateArticle = (message: string): ArticleError => ({ name: "DuplicateArticle", message });
export const DuplicatePlayer = (message: string): BigBoardError => ({ name: "DuplicatePlayer", message });
export const DatabaseError = (message: string): ArticleError | BigBoardError | ForumPostError => ({ name: "DatabaseError", message });
export const ArticleValidationError = (message: string): ArticleError => ({ name: "ArticleValidationError", message });
export const BigBoardValidationError = (message: string): BigBoardError => ({ name: "BigBoardValidationError", message });
export const UnknownArticleError = (message: string): ArticleError => ({ name: "UnknownArticleError", message });
export const UnknownBigBoardError = (message: string): BigBoardError => ({ name: "UnknownBigBoardError", message });

export interface IOnDraftRepository {
    getBigBoard(year: number, creator: BigBoardCreator, filter?: DraftBoardFilter): Promise<Result<BigBoard, BigBoardError>>;
    createBigBoardYear(year: number): Promise<Result<void, BigBoardError>>;
    deleteBigBoardYear(year: number): Promise<Result<void, BigBoardError>>;
    getSavedSchools(year: number): Promise<Result<string[], BigBoardError>>;
    getBigBoardYears(): Promise<Result<number[], BigBoardError>>;
    getArticles(published?: boolean): Promise<Result<Article[], ArticleError>>;
    getArticleTags(): Promise<Result<string[], ArticleError>>;
    createArticle(article: Article): Promise<Result<Article, ArticleError>>;
    createBigBoardEntry(year: number, creator: BigBoardCreator, entry: BigBoardEntry): Promise<Result<BigBoardEntry, BigBoardError>>;
    updateBigBoardEntry(year: number, creator: BigBoardCreator, entry: BigBoardEntry): Promise<Result<BigBoardEntry, BigBoardError>>;
    replaceBigBoardEntries(year: number, creator: BigBoardCreator, entries: BigBoardEntry[]): Promise<Result<BigBoard, BigBoardError>>;
    deleteArticle(id: string): Promise<Result<void, ArticleError>>;
    deleteBigBoardEntry(year: number, creator: BigBoardCreator, playerName: string): Promise<Result<void, BigBoardError>>;
    getBigBoardEntry(year: number, creator: BigBoardCreator, playerName: string): Promise<Result<BigBoardEntry, BigBoardError>>;
    getBigBoardEntryById(year: number, creator: BigBoardCreator, entryId: string): Promise<Result<BigBoardEntry, BigBoardError>>;
    getArticle(id: string): Promise<Result<Article, ArticleError>>;
    getFilteredArticles(filter: ArticleFilter): Promise<Result<Article[], ArticleError>>;
    updateArticle(article: Article): Promise<Result<Article, ArticleError>>;
    commentByArticleId(articleId: string, comment: Comment): Promise<Result<Comment, ArticleError>>;
    likeByArticleId(articleId: string, userId: string): Promise<Result<Article, ArticleError>>;
    likeByCommentId(commentId: string, userId: string): Promise<Result<Comment, ArticleError>>;
    deleteComment(commentId: string): Promise<Result<void, ArticleError>>;
    commentReplyByCommentId(commentId: string, reply: Comment): Promise<Result<Comment, ArticleError>>;
    createForumPost(post: ForumPost): Promise<Result<ForumPost, ForumPostError>>;
    getForumPosts(): Promise<Result<ForumPost[], ForumPostError>>;
    getForumPost(postId: string): Promise<Result<ForumPost, ForumPostError>>;
    likeByForumPostId(postId: string, userId: string): Promise<Result<ForumPost, ForumPostError>>;
    commentByForumPostId(postId: string, comment: Comment): Promise<Result<Comment, ForumPostError>>;
    getFilteredForumPosts(filter: ForumPostFilter): Promise<Result<ForumPost[], ForumPostError>>;
    deleteForumPost(postId: string): Promise<Result<void, ForumPostError>>;
    createYoutubeVideo(video: Video): Promise<Result<Video, ArticleError>>;
    getYoutubeVideo(videoId: string): Promise<Result<Video, ArticleError>>;
    getYoutubeVideos(): Promise<Result<Video[], ArticleError>>;
    filterYoutubeVideos(query: VideoQuery): Promise<Result<Video[], ArticleError>>;
    updateYoutubeVideo(videoId: string, video: Video): Promise<Result<Video, ArticleError>>;
    updateYoutubeVideoStats(videoId: string, stats: { thumbnailUrl?: string; viewCount?: number; youtubeStatsFetchedAt: Date }): Promise<Result<Video, ArticleError>>;
    deleteYoutubeVideo(videoId: string): Promise<Result<void, ArticleError>>;
    getTags(): Promise<Result<string[], ArticleError>>;
    getConsensusBigBoard(year: number): Promise<Result<ConsensusBigBoard, BigBoardError>>;
}
