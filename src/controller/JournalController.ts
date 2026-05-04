import type { Response } from "express";
import type { IJournalEntry } from "../model/JournalEntry";
import type { JournalFilterStatus } from "../repository/JournalRespository";
import type { IJournalBrowserSession } from "../session/JournalSession";
import { JournalError } from "../service/errors";
import { IJournalService } from "../service/JournalService";
import { ILoggingService } from "../service/LoggingService";

export interface ICheeksCastController {
  
}

class CheeksCastController implements ICheeksCastController {
  constructor(
    private readonly service: ICheeksCastService,
    private readonly logger: ILoggingService,
  ) {}

  private isWebsiteError(value: unknown): value is JournalError {
    return (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      "message" in value
    );
  }

  private mapErrorStatus(error: JournalError): number {
    return 500;
  }

  private async renderDashboardState(
    res: Response,
    session: IJournalBrowserSession,
    entries?: IJournalEntry[],
  ): Promise<void> {
    if (entries) {
      res.render("entries/partials/dashboardState", {
        entries,
        session,
        layout: false,
      });
      return;
    }

    const entriesResult = await this.service.listEntries();
    if (!entriesResult.ok) {
      res.status(500).render("entries/partials/error", {
        message: "Unable to load journal entries.",
        layout: false,
      });
      return;
    }

    res.render("entries/partials/dashboardState", {
      entries: entriesResult.value,
      session,
      layout: false,
    });
  }

  async showEntries(res: Response, session: IJournalBrowserSession): Promise<void> {
    this.logger.info("Rendering journal entries page");
    const entriesResult = await this.service.listEntries();
    if (!entriesResult.ok) {
      const message = this.isJournalError(entriesResult.value)
        ? entriesResult.value.message
        : "Unable to load journal entries.";
      res.status(500).render("entries/index", { entries: [], pageError: message, session });
      return;
    }

    res.render("entries/index", { entries: entriesResult.value, pageError: null, session });
  }

  async createFromForm(
    res: Response,
    title: string,
    body: string,
    tag: string,
    session: IJournalBrowserSession,
  ): Promise<void> {
    this.logger.info("Creating journal entry from form");
    const result = await this.service.createEntry({ title, body, tag });

    if (!result.ok && this.isJournalError(result.value)) {
      const status = this.mapErrorStatus(result.value);
      const log = status === 400 ? this.logger.warn : this.logger.error;
      log.call(this.logger, `Create journal entry failed: ${result.value.message}`);
      res.status(status).render("entries/partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    if (!result.ok) {
      res.status(500).render("entries/partials/error", {
        message: "Unable to create journal entry.",
        layout: false,
      });
      return;
    }

    await this.renderDashboardState(res, session);
  }

  async toggleFromForm(
    res: Response,
    id: number,
    session: IJournalBrowserSession,
  ): Promise<void> {
    this.logger.info(`Toggling journal entry ${id}`);
    const result = await this.service.toggleEntry(id);

    if (!result.ok && this.isJournalError(result.value)) {
      res.status(this.mapErrorStatus(result.value)).render("entries/partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    if (!result.ok) {
      res.status(500).render("entries/partials/error", {
        message: "Unable to toggle journal entry.",
        layout: false,
      });
      return;
    }

    await this.renderDashboardState(res, session);
  }

  async searchFromHtmx(
    res: Response,
    query: string,
    session: IJournalBrowserSession,
  ): Promise<void> {
    const result = await this.service.searchEntries(query);
    if (!result.ok && this.isJournalError(result.value)) {
      res.status(this.mapErrorStatus(result.value)).render("entries/partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    if (!result.ok) {
      res.status(500).render("entries/partials/error", {
        message: "Unable to search journal entries.",
        layout: false,
      });
      return;
    }

    await this.renderDashboardState(res, session, result.value);
  }

  async filterFromHtmx(
    res: Response,
    status: string,
    session: IJournalBrowserSession,
    currentStatus?: JournalFilterStatus,
  ): Promise<void> {
    const result = await this.service.filterEntriesByStatus(status);
    if (!result.ok && this.isJournalError(result.value)) {
      res.status(this.mapErrorStatus(result.value)).render("entries/partials/error", {
        message: result.value.message,
        layout: false,
      });
      return;
    }

    if (!result.ok) {
      res.status(500).render("entries/partials/error", {
        message: "Unable to filter journal entries.",
        layout: false,
      });
      return;
    }

    const nextSession = currentStatus ? { ...session, lastFilter: currentStatus } : session;
    await this.renderDashboardState(res, nextSession, result.value);
  }
}

export function CreateJournalController(
  service: IJournalService,
  logger: ILoggingService,
): IJournalController {
  return new JournalController(service, logger);
}
