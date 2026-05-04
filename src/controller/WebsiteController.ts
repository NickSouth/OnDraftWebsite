import type { Request, Response } from "express";
import type { IWebsiteBrowserSession } from "../session/WebsiteSession";
import { isAdminSession } from "../session/WebsiteSession";
import type { IWebsiteService } from "../service/WebsiteService";
import type { ILoggingService } from "../service/LoggingService";
import { ArticleError, BigBoardError } from "../repository/WebsiteRepository";
import { publicArticleUploadUrl } from "../uploads/articlePdfUpload";
import type { ArticleFilter } from "../model/WebsiteContent";

export interface IWebsiteController {
  showHome(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showArticles(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showFilteredArticles(req: Request, res: Response): Promise<void>;
  showBigBoard(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showOneArticle(res: Response, session: IWebsiteBrowserSession, id: string): Promise<void>;
  showCreateArticleForm(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showCreateBigBoardEntryForm(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  createArticle(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void>;
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

  private buildArticleFilter(req: Request): ArticleFilter {
    const keyword = this.queryString(req, "keyword");
    const author = this.queryString(req, "author");
    const dateFrom = this.queryDate(req, "dateFrom");
    const dateTo = this.queryDate(req, "dateTo");
    const tags = this.queryString(req, "tags")
      ?.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const filter: ArticleFilter = {};
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

  private async getArticleTagSuggestions(): Promise<string[]> {
    const result = await this.service.getArticleTags();
    return result.ok === true ? result.value : [];
  }

  async showHome(res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering website home page");
    res.render("website/index", { session, isAdmin: isAdminSession(session) });
  }

  async showArticles(res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering articles page");
    const result = await this.service.getArticles();
    if (result.ok === false) {
      this.logger.error("Failed to load articles" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.render("website/articles", { session, isAdmin: isAdminSession(session), articles: result.value });
  }

  async showFilteredArticles(req: Request, res: Response): Promise<void> {
    this.logger.info("Rendering filtered articles");
    const result = await this.service.getFilteredArticles(this.buildArticleFilter(req));
    if (result.ok === false) {
      this.logger.error("Failed to filter articles" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }

    res.render("website/partials/articleList", {
      layout: false,
      articles: result.value,
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
    res.render("website/article", { session, isAdmin: isAdminSession(session), article: result.value });
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

  async createArticle(req: Request, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Creating new article");
    const contentType = req.body.contentType === "pdf" || req.body.contentType === "html"
      ? req.body.contentType
      : "plainText";
    const uploadedPdf = this.articleUpload(req, "pdf");
    const uploadedImage = this.articleUpload(req, "image");
    const input = {
      title: req.body.title,
      author: req.body.author,
      writeup: req.body.writeup,
      tags: this.parseArticleTags(req.body.tags),
      publicationDate: new Date(req.body.publicationDate),
      content: contentType === "pdf"
        ? uploadedPdf
          ? {
              type: "pdf" as const,
              url: publicArticleUploadUrl(uploadedPdf.filename),
              originalName: uploadedPdf.originalname,
              mimeType: "application/pdf" as const,
              size: uploadedPdf.size,
            }
          : {
              type: "pdf" as const,
              url: "",
              originalName: "",
              mimeType: "application/pdf" as const,
              size: 0,
            }
        : {
            ...(contentType === "html"
              ? {
                  type: "html" as const,
                  body: req.body.content,
                }
              : {
                  type: "plainText" as const,
                  text: req.body.content,
                }),
          },
      imageUrl: uploadedImage ? publicArticleUploadUrl(uploadedImage.filename) : undefined,
    };
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
    res.redirect(`/articles/${result.value.id}`);
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
