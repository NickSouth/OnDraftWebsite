import type { Request, Response } from "express";
import type { IWebsiteBrowserSession } from "../session/WebsiteSession";
import { isAdminSession } from "../session/WebsiteSession";
import type { IWebsiteService } from "../service/WebsiteService";
import type { ILoggingService } from "../service/LoggingService";
import { ArticleError, BigBoardError } from "../repository/WebsiteRepository";
import { publicArticleUploadUrl } from "../uploads/articlePdfUpload";

export interface IWebsiteController {
  showHome(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showArticles(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showBigBoard(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showOneArticle(res: Response, session: IWebsiteBrowserSession, title: string): Promise<void>;
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

  async showOneArticle(res: Response, session: IWebsiteBrowserSession, title: string): Promise<void> {
    this.logger.info(`Rendering article page for "${title}"`);
    const result = await this.service.getArticle(title);
    if (result.ok === false) {
      this.logger.error(`Failed to load article "${title}"`+ { error: result.value });
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
    const contentType = req.body.contentType === "pdf" ? "pdf" : "plainText";
    const uploadedPdf = this.articleUpload(req, "pdf");
    const uploadedImage = this.articleUpload(req, "image");
    const input = {
      title: req.body.title,
      author: req.body.author,
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
            type: "plainText" as const,
            text: req.body.content,
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
      });
      return;
    }
    res.redirect(`/articles/${encodeURIComponent(result.value.title)}`);
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
    const title = req.params.title;
    const result = await this.service.deleteArticle(title);
    if (result.ok === false) {
      this.logger.error(`Failed to delete article "${title}" ` + { error: result.value });
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
