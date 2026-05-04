import type { Response } from "express";
import type { IWebsiteBrowserSession } from "../session/WebsiteSession";
import type { IWebsiteService } from "../service/WebsiteService";
import type { ILoggingService } from "../service/LoggingService";

export interface IWebsiteController {
  showHome(res: Response, session: IWebsiteBrowserSession): Promise<void>;
}

class WebsiteController implements IWebsiteController {
  constructor(
    private readonly service: IWebsiteService,
    private readonly logger: ILoggingService,
  ) {}

  async showHome(res: Response, session: IWebsiteBrowserSession): Promise<void> {
    this.logger.info("Rendering website home page");
    res.render("website/index", { session });
  }
}

export function CreateWebsiteController(
  service: IWebsiteService,
  logger: ILoggingService,
): IWebsiteController {
  return new WebsiteController(service, logger);
}
