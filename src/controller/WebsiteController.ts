import type { Response } from "express";
import type { IWebsiteBrowserSession } from "../session/WebsiteSession";
import type { IWebsiteService } from "../service/WebsiteService";
import type { ILoggingService } from "../service/LoggingService";
import { ArticleError, BigBoardError } from "../repository/WebsiteRepository";

export interface IWebsiteController {
  showHome(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showArticles(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showBigBoard(res: Response, session: IWebsiteBrowserSession): Promise<void>;
  showOneArticle(res: Response, session: IWebsiteBrowserSession, title: string): Promise<void>;
  createArticle(req: any, res: Response, session: IWebsiteBrowserSession): Promise<void>;
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

  async showHome(res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering website home page");
    res.render("website/index", { session });
  }

  async showArticles(res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering articles page");
    const result = await this.service.getArticles();
    if (!result.ok) {
      this.logger.error("Failed to load articles" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.render("website/articles", { session, articles: result.value });
  }

  async showBigBoard(res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering big board page");
    const result = await this.service.getBigBoard();
    if (!result.ok) {
      this.logger.error("Failed to load big board" + { error: result.value });
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.render("website/bigboard", { session, bigBoard: result.value });
  }

  async showOneArticle(res: Response, session: IWebsiteBrowserSession, title: string): Promise<void> {
    this.logger.info(`Rendering article page for "${title}"`);
    const result = await this.service.getArticle(title);
    if (!result.ok) {
      this.logger.error(`Failed to load article "${title}"`+ { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.render("website/article", { session, article: result.value });
  }

  async createArticle(req: any, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Creating new article");
    const input = req.body;
    const result = await this.service.createArticle(input);
    if (!result.ok) {
      this.logger.error("Failed to create article" + { error: result.value });
      res.status(this.mapArticleErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.status(201).json(result.value);
  }

  async createBigBoardEntry(req: any, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Creating new big board entry");
    const input = req.body;
    const result = await this.service.createBigBoardEntry(input);
    if (!result.ok) {
      this.logger.error("Failed to create big board entry" + {error: result.value });
      res.status(this.mapBigBoardErrorToStatusCode(result.value)).send(result.value.message);
      return;
    }
    res.status(201).json(result.value);
  }

  async deleteArticle(req: any, res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Deleting article");
    const title = req.params.title;
    const result = await this.service.deleteArticle(title);
    if (!result.ok) {
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
    if (!result.ok) {
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
