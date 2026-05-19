import type { Response } from "express";
import {
  getAuthenticatedUser,
  signInAuthenticatedUser,
  signOutAuthenticatedUser,
  touchOnDraftSession,
  type IOnDraftBrowserSession,
  type OnDraftSessionStore,
} from "../session/OnDraftSession";
import type { ILoggingService } from "../service/LoggingService";
import type { IAuthService } from "./AuthService";
import type { AuthError } from "./errors";

export interface IAuthController {
  showLogin(res: Response, session: IOnDraftBrowserSession, pageError?: string | null): Promise<void>;
  showRegister(res: Response, session: IOnDraftBrowserSession, pageError?: string | null): Promise<void>;
  showVerifyEmailResult(
    res: Response,
    session: IOnDraftBrowserSession,
    status: "success" | "failure",
    message: string,
  ): Promise<void>;
  showMailingListUnsubscribeResult(
    res: Response,
    session: IOnDraftBrowserSession,
    status: "success" | "failure",
    message: string,
  ): Promise<void>;
  loginFromForm(
    res: Response,
    email: string,
    password: string,
    store: OnDraftSessionStore,
  ): Promise<void>;
  registerFromForm(
    res: Response,
    displayName: string,
    email: string,
    password: string,
    mailingListConsent: boolean,
    store: OnDraftSessionStore,
  ): Promise<void>;
  verifyEmailFromRequest(
    res: Response,
    token: string,
    store: OnDraftSessionStore,
  ): Promise<void>;
  requestEmailVerificationFromForm(
    res: Response,
    email: string,
    store: OnDraftSessionStore,
  ): Promise<void>;
  unsubscribeMailingListFromRequest(
    res: Response,
    token: string,
    store: OnDraftSessionStore,
  ): Promise<void>;
  exportSubscribedMailingListCsv(res: Response): Promise<void>;
  logoutFromForm(res: Response, store: OnDraftSessionStore): Promise<void>;
}

class AuthController implements IAuthController {
  constructor(
    private readonly service: IAuthService,
    private readonly logger: ILoggingService,
  ) {}

  private mapErrorStatus(error: AuthError): number {
    if (error.name === "InvalidCredentials") return 401;
    if (error.name === "UserAlreadyExists") return 409;
    if (error.name === "ValidationError") return 400;
    return 500;
  }

  async showLogin(
    res: Response,
    session: IOnDraftBrowserSession,
    pageError: string | null = null,
  ): Promise<void> {
    res.render("auth/login", { pageError, session });
  }

  async showRegister(
    res: Response,
    session: IOnDraftBrowserSession,
    pageError: string | null = null,
  ): Promise<void> {
    res.render("auth/register", { pageError, session });
  }

  async showVerifyEmailResult(
    res: Response,
    session: IOnDraftBrowserSession,
    status: "success" | "failure",
    message: string,
  ): Promise<void> {
    res.render("auth/verifyEmail", { status, message, session });
  }

  async showMailingListUnsubscribeResult(
    res: Response,
    session: IOnDraftBrowserSession,
    status: "success" | "failure",
    message: string,
  ): Promise<void> {
    res.render("auth/mailingListUnsubscribe", { status, message, session });
  }

  async loginFromForm(
    res: Response,
    email: string,
    password: string,
    store: OnDraftSessionStore,
  ): Promise<void> {
    const session = touchOnDraftSession(store);
    const result = await this.service.authenticate({ email, password });

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Login failed: ${error.message}`);
      res.status(status);
      await this.showLogin(res, session, error.message);
      return;
    }

    const nextSession = signInAuthenticatedUser(store, result.value);
    this.logger.info(`Authenticated ${nextSession.authenticatedUser?.email ?? "unknown user"}`);
    res.redirect("/");
  }

  async registerFromForm(
    res: Response,
    displayName: string,
    email: string,
    password: string,
    mailingListConsent: boolean,
    store: OnDraftSessionStore,
  ): Promise<void> {
    const session = touchOnDraftSession(store);
    const result = await this.service.register({ displayName, email, password, mailingListConsent });

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Registration failed: ${error.message}`);
      res.status(status);
      await this.showRegister(res, session, error.message);
      return;
    }

    const nextSession = signInAuthenticatedUser(store, result.value);
    this.logger.info(`Registered ${nextSession.authenticatedUser?.email ?? "unknown user"}`);
    res.redirect("/");
  }

  async verifyEmailFromRequest(
    res: Response,
    token: string,
    store: OnDraftSessionStore,
  ): Promise<void> {
    const session = touchOnDraftSession(store);
    const result = await this.service.verifyEmail({ token });

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Email verification failed: ${error.message}`);
      res.status(status);
      await this.showVerifyEmailResult(res, session, "failure", error.message);
      return;
    }

    this.logger.info("Email verification completed");
    await this.showVerifyEmailResult(
      res,
      session,
      "success",
      "Your email has been verified.",
    );
  }

  async requestEmailVerificationFromForm(
    res: Response,
    email: string,
    store: OnDraftSessionStore,
  ): Promise<void> {
    const session = touchOnDraftSession(store);
    const requestedEmail = session.authenticatedUser?.email ?? email;
    const result = await this.service.requestEmailVerification({ email: requestedEmail });

    if (result.ok === false) {
      this.logger.error(`Verification email request failed: ${result.value.message}`);
      res.status(500);
      await this.showVerifyEmailResult(
        res,
        session,
        "failure",
        "We could not process that request right now.",
      );
      return;
    }

    this.logger.info("Verification email request accepted");
    await this.showVerifyEmailResult(
      res,
      session,
      "success",
      "If that email needs verification, we sent a new verification link.",
    );
  }

  async unsubscribeMailingListFromRequest(
    res: Response,
    token: string,
    store: OnDraftSessionStore,
  ): Promise<void> {
    const session = touchOnDraftSession(store);
    const result = await this.service.unsubscribeMailingList({ token });

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Mailing list unsubscribe failed: ${error.message}`);
      res.status(status);
      await this.showMailingListUnsubscribeResult(res, session, "failure", error.message);
      return;
    }

    this.logger.info("Mailing list unsubscribe completed");
    await this.showMailingListUnsubscribeResult(
      res,
      session,
      "success",
      "You have been unsubscribed from OnDraft marketing emails.",
    );
  }

  async exportSubscribedMailingListCsv(res: Response): Promise<void> {
    const result = await this.service.exportSubscribedMailingListCsv();

    if (result.ok === false) {
      this.logger.error(`Mailing list CSV export failed: ${result.value.message}`);
      res.status(500).render("ondraft/partials/error", {
        message: "Unable to export mailing list subscribers.",
      });
      return;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ondraft-mailing-list-subscribers.csv"');
    res.send(result.value);
  }

  async logoutFromForm(res: Response, store: OnDraftSessionStore): Promise<void> {
    const currentUser = getAuthenticatedUser(store);

    if (currentUser) {
      this.logger.info(`Signing out ${currentUser.email}`);
    }

    signOutAuthenticatedUser(store);
    res.redirect("/");
  }
}

export function CreateAuthController(
  service: IAuthService,
  logger: ILoggingService,
): IAuthController {
  return new AuthController(service, logger);
}
