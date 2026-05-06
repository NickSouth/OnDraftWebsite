import type { Request, Response } from "express";
import type { IOnDraftBrowserSession } from "../session/OnDraftSession";
import { isAdminSession } from "../session/OnDraftSession";
import type { CreateArticleInput, IOnDraftService } from "../service/OnDraftService";
import type { ILoggingService } from "../service/LoggingService";
import { ArticleError, BigBoardError } from "../repository/OnDraftRepository";
import { publicArticleUploadUrl } from "../uploads/articlePdfUpload";
import type { Article, ArticleContent, ArticleFilter } from "../model/OnDraftContent";

export interface IOnDraftController {
  showHome(res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showArticles(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showFilteredArticles(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showBigBoard(res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showOneArticle(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void>;
  showCreateArticleForm(res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showEditArticleForm(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void>;
  showArticlePreview(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void>;
  showCreateBigBoardEntryForm(res: Response, session: IOnDraftBrowserSession): Promise<void>;
  previewArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  createArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  updateArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  likeArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  showArticleComments(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  commentOnArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  commentReply(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  likeComment(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  deleteComment(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  createBigBoardEntry(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  deleteArticle(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void>;
  deleteBigBoardEntry(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void>;
}

class OnDraftController implements IOnDraftController {
  constructor(
    private readonly service: IOnDraftService,
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

  private articleStatus(req: Request, session: IOnDraftBrowserSession): boolean {
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

  private buildArticleFilter(req: Request, session: IOnDraftBrowserSession): ArticleFilter {
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

  private findCommentById(comments: Article["comments"], commentId: string): Article["comments"][number] | undefined {
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

  private likeActorId(session: IOnDraftBrowserSession): string {
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

  async showHome(res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering ondraft home page");
    res.render("ondraft/index", { session, isAdmin: isAdminSession(session) });
  }

  async showArticles(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering articles page");
    const showingPublished = this.articleStatus(req, session);
    const result = await this.service.getFilteredArticles(this.buildArticleFilter(req, session));
    if (result.ok === false) {
      this.logger.error("Failed to load articles" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.render("ondraft/articles", {
      session,
      isAdmin: isAdminSession(session),
      articles: result.value,
      showingPublished,
      sortBy: this.articleSortBy(req),
      sortDirection: this.articleSortDirection(req),
    });
  }

  private articleFormValues(article: Article): Record<string, string> {
    return {
      title: article.title,
      author: article.author,
      publicationDate: new Date(article.publicationDate).toISOString().slice(0, 10),
      writeup: article.writeup,
      tags: (article.tags ?? []).join(","),
      contentType: article.content.type === "plainText" ? "plainText" : article.content.type,
      content: article.content.type === "plainText"
        ? article.content.text
        : article.content.type === "html"
          ? article.content.body
          : "",
      imageUrl: article.imageUrl ?? "",
      pdfUrl: article.content.type === "pdf" ? article.content.url : "",
      pdfOriginalName: article.content.type === "pdf" ? article.content.originalName : "",
      pdfSize: article.content.type === "pdf" ? String(article.content.size) : "",
    };
  }

  private renderArticlePreview(res: Response, session: IOnDraftBrowserSession, article: Article): void {
    res.render("ondraft/articlePreview", {
      session,
      isAdmin: isAdminSession(session),
      article,
      likeActorId: this.likeActorId(session),
      values: this.articleFormValues(article),
      formAction: article.id === "preview" ? "/articles" : `/articles/${article.id}`,
      editHref: article.id === "preview" ? "/articles/new" : `/articles/${article.id}/edit`,
    });
  }

  async showFilteredArticles(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering filtered articles");
    const showingPublished = this.articleStatus(req, session);
    const result = await this.service.getFilteredArticles(this.buildArticleFilter(req, session));
    if (result.ok === false) {
      this.logger.error("Failed to filter articles" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("ondraft/partials/articleList", {
      layout: false,
      articles: result.value,
      showingPublished,
      isAdmin: isAdminSession(session),
    });
  }

  async showBigBoard(res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering big board page");
    const result = await this.service.getBigBoard();
    if (result.ok === false) {
      this.logger.error("Failed to load big board" + { error: result.value });
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    const rankedBigBoard = [...result.value].sort((a, b) => a.rank - b.rank);
    res.render("ondraft/bigboard", { session, isAdmin: isAdminSession(session), bigBoard: rankedBigBoard });
  }

  async showOneArticle(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void> {
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
    res.render("ondraft/article", {
      session,
      isAdmin: isAdminSession(session),
      article: result.value,
      commentsLimit: 10,
      likeActorId: this.likeActorId(session),
    });
  }

  private renderArticleActions(res: Response, article: Article, session: IOnDraftBrowserSession): void {
    res.render("ondraft/partials/articleActions", {
      layout: false,
      article,
      session,
      likeActorId: this.likeActorId(session),
    });
  }

  async showCreateArticleForm(res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering create article page");
    res.render("ondraft/createArticle", {
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      values: {},
      existingTags: await this.getArticleTagSuggestions(),
      heading: "Create Article",
      formAction: "/articles/preview",
      saveAction: "/articles",
    });
  }

  async showEditArticleForm(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void> {
    this.logger.info(`Rendering edit article page for "${id}"`);
    const result = await this.service.getArticle(id);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("ondraft/createArticle", {
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      values: this.articleFormValues(result.value),
      existingTags: await this.getArticleTagSuggestions(),
      heading: "Edit Article",
      formAction: `/articles/${result.value.id}/preview`,
      saveAction: `/articles/${result.value.id}`,
    });
  }

  async showArticlePreview(res: Response, session: IOnDraftBrowserSession, id: string): Promise<void> {
    this.logger.info(`Rendering article preview page for "${id}"`);
    const result = await this.service.getArticle(id);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    this.renderArticlePreview(res, session, result.value);
  }

  async showCreateBigBoardEntryForm(res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Rendering create big board entry page");
    res.render("ondraft/createBigBoardEntry", {
      session,
      isAdmin: isAdminSession(session),
      errorMessage: null,
      values: {},
    });
  }

  async previewArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Previewing new article");
    const input = this.buildArticleInput(req, false);
    const id = req.params.id;
    const result = typeof id === "string"
      ? await this.service.previewUpdatedArticle(id, input)
      : await this.service.previewArticle(input);
    if (result.ok === false) {
      this.logger.error("Failed to preview article" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("ondraft/createArticle", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
        existingTags: await this.getArticleTagSuggestions(),
        heading: typeof id === "string" ? "Edit Article" : "Create Article",
        formAction: typeof id === "string" ? `/articles/${id}/preview` : "/articles/preview",
        saveAction: typeof id === "string" ? `/articles/${id}` : "/articles",
      });
      return;
    }

    this.renderArticlePreview(res, session, result.value);
  }

  async createArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Creating new article");
    const input = this.buildArticleInput(req, req.body.published === "false" ? false : true);
    const result = await this.service.createArticle(input);
    if (result.ok === false) {
      this.logger.error("Failed to create article" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("ondraft/createArticle", {
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

  async updateArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Updating article");
    const id = this.routeParam(req, "id");
    const input = this.buildArticleInput(req, req.body.published === "false" ? false : true);
    const result = await this.service.updateArticle(id, input);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).render("ondraft/createArticle", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
        existingTags: await this.getArticleTagSuggestions(),
        heading: "Edit Article",
        formAction: `/articles/${id}/preview`,
        saveAction: `/articles/${id}`,
      });
      return;
    }

    res.redirect(result.value.published ? `/articles/${result.value.id}` : "/articles?status=draft");
  }

  async likeArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const articleId = this.routeParam(req, "id");
    const result = await this.service.likeByArticleId(articleId, this.likeActorId(session));
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    this.renderArticleActions(res, result.value, session);
  }

  async showArticleComments(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const articleId = this.routeParam(req, "id");
    const result = await this.service.getArticle(articleId);
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("ondraft/partials/articleComments", {
      layout: false,
      article: result.value,
      session,
      isAdmin: isAdminSession(session),
      commentsLimit: this.commentLimit(req),
      likeActorId: this.likeActorId(session),
      errorMessage: null,
    });
  }

  async commentOnArticle(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const authenticatedUser = session.authenticatedUser;
    if (!authenticatedUser) {
      res.status(403).render("ondraft/partials/error", {
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
        res.status(statusCode).render("ondraft/partials/articleComments", {
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

  async commentReply(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const authenticatedUser = session.authenticatedUser;
    if (!authenticatedUser) {
      res.status(403).render("ondraft/partials/error", {
        layout: false,
        message: "Log in to comment.",
      });
      return;
    }

    const commentId = this.routeParam(req, "commentId");
    const result = await this.service.commentReplyByCommentId(commentId, {
      parentCommentId: commentId,
      userId: authenticatedUser.userId,
      userName: authenticatedUser.displayName,
      text: req.body.text,
    });
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    await this.showArticleComments(req, res, session);
  }

  async likeComment(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const commentId = this.routeParam(req, "commentId");
    const result = await this.service.likeByCommentId(commentId, this.likeActorId(session));
    if (result.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("ondraft/partials/commentLikeButton", {
      layout: false,
      comment: result.value,
      likeActorId: this.likeActorId(session),
    });
  }

  async deleteComment(req: Request, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    const articleId = this.routeParam(req, "id");
    const commentId = this.routeParam(req, "commentId");
    const articleResult = await this.service.getArticle(articleId);
    if (articleResult.ok === false) {
      res.status(this.mapArticleErrorToStatusCode(articleResult.value)).send(articleResult.value.message);
      return;
    }

    const comment = this.findCommentById(articleResult.value.comments, commentId);
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

  async createBigBoardEntry(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void> {
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
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).render("ondraft/createBigBoardEntry", {
        session,
        isAdmin: isAdminSession(session),
        errorMessage: result.value.message,
        values: req.body,
      });
      return;
    }
    res.redirect("/bigboard");
  }

  async deleteArticle(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void> {
    this.logger.info("Deleting article");
    const id = req.params.id;
    const result = await this.service.deleteArticle(id);
    if (result.ok === false) {
      this.logger.error(`Failed to delete article "${id}" ` + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.status(200).send("");
  }

  async deleteBigBoardEntry(req: any, res: Response, session: IOnDraftBrowserSession): Promise<void> {
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

export function CreateOnDraftController(
  service: IOnDraftService,
  logger: ILoggingService,
): IOnDraftController {
  return new OnDraftController(service, logger);
}
