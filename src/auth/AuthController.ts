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
