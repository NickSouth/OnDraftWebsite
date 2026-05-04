import type { Request, Response } from "express";
import type { IWebsiteBrowserSession } from "../session/WebsiteSession";
import { isAdminSession } from "../session/WebsiteSession";
import type { CreateArticleInput, IWebsiteService } from "../service/WebsiteService";
import type { ILoggingService } from "../service/LoggingService";
import { ArticleError, BigBoardError } from "../repository/WebsiteRepository";
import { publicArticleUploadUrl } from "../uploads/articlePdfUpload";
import type { Article, ArticleContent, ArticleFilter } from "../model/WebsiteContent";

export interface IWebsiteController {
  showHome(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showArticles(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showFilteredArticles(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showBigBoard(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showOneArticle(res: Response, session: IWebsiteBrowserSession, id: string): Promise<void>;
  showCreateArticleForm(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showCreateBigBoardEntryForm(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  previewArticle(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void>;
  createArticle(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void>;
  likeArticle(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showArticleComments(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void>;
  commentOnArticle(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void>;
  likeComment(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void>;
  deleteComment(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void>;
  createBigBoardEntry(req: any, res: Response, session: IWebsiteBrowserSession): Promise<void>;
  deleteArticle(req: any, res: Response, session: IWebsiteBrowserSession): Promise<void>;
  deleteBigBoardEntry(req: any, res: Response, session: IWebsiteBrowserSession): Promise<void>;
}

class WebsiteController implements IWebsiteController {
  constructor(
    private readonly service: IWebsiteService,
    private readonly logger: ILoggingService,
  ) {}

  private mapArticleErrorToStatusCode(error: ArticleError): number {
    switch (error.name) {
      case "ArticleNotFound":
      case "CommentNotFound":
        return 404;
      case "DuplicateArticle":
        return 409;
      case "ArticleValidationError":
        return 400;
      case "DatabaseError":
        return 500;
      default:
        return 500;
    }
  }

  private mapBigBoardErrorToStatusCode(error: BigBoardError): number {
    switch (error.name) {
      case "PlayerNotFound":
        return 404;
      case "DuplicatePlayer":
        return 409;
      case "BigBoardValidationError":
        return 400;
      case "DatabaseError":
        return 500;
      default:
        return 500;
    }
  }

  private articleUpload(req: Request, fieldName: "pdf" | "image"): Express.Multer.File | undefined {
    const files = req.files;
    if (!files || Array.isArray(files)) {
      return undefined;
    }

    return files[fieldName]?.[0];
  }

  private queryString(req: Request, key: string): string | undefined {
    const value = req.query[key];
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private queryDate(req: Request, key: string): Date | undefined {
    const value = this.queryString(req, key);
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }

  private articleStatus(req: Request, session: IWebsiteBrowserSession): boolean {
    if (!isAdminSession(session)) {
      return true;
    }

    return this.queryString(req, "status") === "draft" ? false : true;
  }

  private articleSortBy(req: Request): ArticleFilter["sortBy"] {
    const sortBy = this.queryString(req, "sortBy");
    return sortBy === "likes" || sortBy === "comments" ? sortBy : "date";
  }

  private articleSortDirection(req: Request): ArticleFilter["sortDirection"] {
    return this.queryString(req, "sortDirection") === "asc" ? "asc" : "desc";
  }

  private buildArticleFilter(req: Request, session: IWebsiteBrowserSession): ArticleFilter {
    const keyword = this.queryString(req, "keyword");
    const author = this.queryString(req, "author");
    const dateFrom = this.queryDate(req, "dateFrom");
    const dateTo = this.queryDate(req, "dateTo");
    const tags = this.queryString(req, "tags")
      ?.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const filter: ArticleFilter = {
      published: this.articleStatus(req, session),
      sortBy: this.articleSortBy(req),
      sortDirection: this.articleSortDirection(req),
    };
    if (keyword) {
      filter.keyword = keyword;
    }
    if (author) {
      filter.author = author;
    }
    if (tags && tags.length > 0) {
      filter.tags = tags;
    }
    if (dateFrom || dateTo) {
      filter.publicationDateRange = {
        from: dateFrom ?? new Date(0),
        to: dateTo ?? new Date(),
      };
    }

    return filter;
  }

  private parseArticleTags(rawTags: unknown): string[] {
    if (typeof rawTags !== "string") {
      return [];
    }

    return rawTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  private routeParam(req: Request, key: string): string {
    const value = req.params[key];
    return Array.isArray(value) ? value[0] : value;
  }

  private commentLimit(req: Request): number {
    const rawLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;
    if (!Number.isFinite(rawLimit)) {
      return 10;
    }

    return Math.max(10, Math.min(100, Math.floor(rawLimit)));
  }

  private likeActorId(session: IWebsiteBrowserSession): string {
    return session.authenticatedUser?.userId ?? session.browserId;
  }

  private async getArticleTagSuggestions(): Promise<string[]> {
    const result = await this.service.getArticleTags();
    return result.ok === true ? result.value : [];
  }

  private buildArticleContent(req: Request): ArticleContent {
    const contentType = req.body.contentType === "pdf" || req.body.contentType === "html"
      ? req.body.contentType
      : "plainText";
    const uploadedPdf = this.articleUpload(req, "pdf");

    if (contentType === "pdf") {
      return uploadedPdf
        ? {
            type: "pdf" as const,
            url: publicArticleUploadUrl(uploadedPdf.filename),
            originalName: uploadedPdf.originalname,
            mimeType: "application/pdf" as const,
            size: uploadedPdf.size,
          }
        : {
            type: "pdf" as const,
            url: typeof req.body.pdfUrl === "string" ? req.body.pdfUrl : "",
            originalName: typeof req.body.pdfOriginalName === "string" ? req.body.pdfOriginalName : "",
            mimeType: "application/pdf" as const,
            size: Number(req.body.pdfSize ?? 0),
          };
    }

    if (contentType === "html") {
      return {
        type: "html" as const,
        body: req.body.content,
      };
    }

    return {
      type: "plainText" as const,
      text: req.body.content,
    };
  }

  private buildArticleInput(req: Request, published: boolean): CreateArticleInput {
    const uploadedImage = this.articleUpload(req, "image");

    return {
      title: req.body.title,
      author: req.body.author,
      writeup: req.body.writeup,
      tags: this.parseArticleTags(req.body.tags),
      published,
      publicationDate: new Date(req.body.publicationDate),
      content: this.buildArticleContent(req),
      imageUrl: uploadedImage
        ? publicArticleUploadUrl(uploadedImage.filename)
        : typeof req.body.imageUrl === "string" && req.body.imageUrl
          ? req.body.imageUrl
          : undefined,
    };
  }

  async showHome(res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering website home page");
    res.render("website/index", { session, isAdmin: isAdminSession(session) });
  }

  async showArticles(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering articles page");
    const showingPublished = this.articleStatus(req, session);
    const result = await this.service.getFilteredArticles(this.buildArticleFilter(req, session));
    if (result.ok === false) {
      this.logger.error("Failed to load articles" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.render("website/articles", {
      session,
      isAdmin: isAdminSession(session),
      articles: result.value,
      showingPublished,
      sortBy: this.articleSortBy(req),
      sortDirection: this.articleSortDirection(req),
    });
  }

  async showFilteredArticles(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering filtered articles");
    const showingPublished = this.articleStatus(req, session);
    const result = await this.service.getFilteredArticles(this.buildArticleFilter(req, session));
    if (result.ok === false) {
      this.logger.error("Failed to filter articles" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("website/partials/articleList", {
      layout: false,
      articles: result.value,
      showingPublished,
    });
  }

  async showBigBoard(res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering big board page");
    const result = await this.service.getBigBoard();
    if (result.ok === false) {
      this.logger.error("Failed to load big board" + { error: result.value });
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    const rankedBigBoard = [...result.value].sort((a, b) => a.rank - b.rank);
    res.render("website/bigboard", { session, isAdmin: isAdminSession(session), bigBoard: rankedBigBoard });
  }

  async showOneArticle(res: Response, session: IWebsiteBrowserSession, id: string): Promise<void> {
    this.logger.info(`Rendering article page for "${id}"`);
    const result = await this.service.getArticle(id);
    if (result.ok === false) {
      this.logger.error(`Failed to load article "${id}"`+ { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    if (!result.value.published && !isAdminSession(session)) {
      res.status(404).send("Article not found.");
      return;
    }
    res.render("website/article", {
      session,
      isAdmin: isAdminSession(session),
      article: result.value,
      commentsLimit: 10,
      likeActorId: this.likeActorId(session),
    });
  }

  private renderArticleActions(res: Response, article: Article, session: IWebsiteBrowserSession): void {
    res.render("website/partials/articleActions", {
      layout: false,
      article,
      session,
      likeActorId: this.likeActorId(session),
    });
  }

  async showCreateArticleForm(res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering create article page");
    res.render("website/createArticle", {
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      values: {},
      existingTags: await this.getArticleTagSuggestions(),
    });
  }

  async showCreateBigBoardEntryForm(res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering create big board entry page");
    res.render("website/createBigBoardEntry", {
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      values: {},
    });
  }

  async previewArticle(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Previewing new article");
    const input = this.buildArticleInput(req, false);
    const result = await this.service.previewArticle(input);
    if (result.ok === false) {
      this.logger.error("Failed to preview article" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("website/createArticle", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
        existingTags: await this.getArticleTagSuggestions(),
      });
      return;
    }

    res.render("website/articlePreview", {
      session,
      isAdmin: isAdminSession(session),
      article: result.value,
      likeActorId: this.likeActorId(session),
      values: {
        ...req.body,
        tags: (result.value.tags ?? []).join(","),
        content: result.value.content.type === "plainText"
          ? result.value.content.text
          : result.value.content.type === "html"
            ? result.value.content.body
            : "",
        imageUrl: result.value.imageUrl,
        pdfUrl: result.value.content.type === "pdf" ? result.value.content.url : "",
        pdfOriginalName: result.value.content.type === "pdf" ? result.value.content.originalName : "",
        pdfSize: result.value.content.type === "pdf" ? String(result.value.content.size) : "",
      },
    });
  }

  async createArticle(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Creating new article");
    const input = this.buildArticleInput(req, req.body.published === "false" ? false : true);
    const result = await this.service.createArticle(input);
    if (result.ok === false) {
      this.logger.error("Failed to create article" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("website/createArticle", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
        existingTags: await this.getArticleTagSuggestions(),
      });
      return;
    }
    res.redirect(result.value.published ? `/articles/${result.value.id}` : "/articles?status=draft");
  }

  async likeArticle(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    const articleId = this.routeParam(req, "id");
    const result = await this.service.likeByArticleId(articleId, this.likeActorId(session));
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    this.renderArticleActions(res, result.value, session);
  }

  async showArticleComments(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    const articleId = this.routeParam(req, "id");
    const result = await this.service.getArticle(articleId);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("website/partials/articleComments", {
      layout: false,
      article: result.value,
      session,
      isAdmin: isAdminSession(session),
      commentsLimit: this.commentLimit(req),
      likeActorId: this.likeActorId(session),
      errorMessage: null,
    });
  }

  async commentOnArticle(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    const authenticatedUser = session.authenticatedUser;
    if (!authenticatedUser) {
      res.status(403).render("website/partials/error", {
        layout: false,
        message: "Log in to comment.",
      });
      return;
    }

    const articleId = this.routeParam(req, "id");
    const result = await this.service.commentByArticleId({
      articleId,
      userId: authenticatedUser.userId,
      userName: authenticatedUser.displayName,
      text: req.body.text,
    });
    if (result.ok === false) {
      const articleResult = await this.service.getArticle(articleId);
      if (articleResult.ok === true) {
        const statusCode = result.value.name === "ArticleValidationError"
          ? 200
          : this.mapArticleErrorToStatusCode(result.value);
        res.status(statusCode).render("website/partials/articleComments", {
          layout: false,
          article: articleResult.value,
          session,
          isAdmin: isAdminSession(session),
          commentsLimit: this.commentLimit(req),
          likeActorId: this.likeActorId(session),
          errorMessage: result.value.message,
        });
        return;
      }

      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    await this.showArticleComments(req, res, session);
  }

  async likeComment(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    const commentId = this.routeParam(req, "commentId");
    const result = await this.service.likeByCommentId(commentId, this.likeActorId(session));
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("website/partials/commentLikeButton", {
      layout: false,
      comment: result.value,
      likeActorId: this.likeActorId(session),
    });
  }

  async deleteComment(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    const articleId = this.routeParam(req, "id");
    const commentId = this.routeParam(req, "commentId");
    const articleResult = await this.service.getArticle(articleId);
    if (articleResult.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(articleResult.value)).send(articleResult.value.message);
      return;
    }

    const comment = articleResult.value.comments.find((entry) => entry.id === commentId);
    if (!comment) {
      res.status(404).send("Comment not found.");
      return;
    }

    const canDelete = isAdminSession(session) || comment.userId === session.authenticatedUser?.userId;
    if (!canDelete) {
      res.status(403).send("You can only delete your own comments.");
      return;
    }

    const result = await this.service.deleteComment(commentId);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    await this.showArticleComments(req, res, session);
  }

  async createBigBoardEntry(req: any, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Creating new big board entry");
    const input = {
      playerName: req.body.playerName,
      position: req.body.position,
      school: req.body.school,
      rank: Number(req.body.rank),
      posRank: Number(req.body.posRank),
      writeup: req.body.writeup,
      age: Number(req.body.age),
      height: {
        feet: Number(req.body.height?.feet),
        inches: Number(req.body.height?.inches),
      },
      weight: Number(req.body.weight),
    };
    const result = await this.service.createBigBoardEntry(input);
    if (result.ok === false) {
      this.logger.error("Failed to create big board entry" + {error: result.value });
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).render("website/createBigBoardEntry", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
      });
      return;
    }
    res.redirect("/bigboard");
  }

  async deleteArticle(req: any, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Deleting article");
    const id = req.params.id;
    const result = await this.service.deleteArticle(id);
    if (result.ok === false) {
      this.logger.error(`Failed to delete article "${id}" ` + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.status(204).send();
  }

  async deleteBigBoardEntry(req: any, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Deleting big board entry");
    const playerName = req.params.playerName;
    const result = await this.service.deleteBigBoardEntry(playerName);
    if (result.ok === false) {
      this.logger.error(`Failed to delete big board entry for player "${playerName}" ` + { error: result.value });
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    } 
  }
}

export function CreateWebsiteController(
  service: IWebsiteService,
  logger: ILoggingService,
): IWebsiteController {
  return new WebsiteController(service, logger);
}
