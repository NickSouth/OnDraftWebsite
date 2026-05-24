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
import type { AccountSettings, AdminUserListItem, BanDuration, IAuthService } from "./AuthService";
import type { AuthError } from "./errors";

export interface IAuthController {
  showLogin(res: Response, session: IOnDraftBrowserSession, pageError?: string | null): Promise<void>;
  showRegister(res: Response, session: IOnDraftBrowserSession, pageError?: string | null): Promise<void>;
  showForgotPassword(res: Response, session: IOnDraftBrowserSession, pageMessage?: string | null, pageError?: string | null): Promise<void>;
  showResetPassword(res: Response, session: IOnDraftBrowserSession, token: string, pageError?: string | null): Promise<void>;
  showPasswordResetResult(
    res: Response,
    session: IOnDraftBrowserSession,
    status: "success" | "failure",
    message: string,
  ): Promise<void>;
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
    rememberMe: boolean,
    store: OnDraftSessionStore,
  ): Promise<void>;
  registerFromForm(
    res: Response,
    displayName: string,
    email: string,
    password: string,
    confirmPassword: string,
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
  requestPasswordResetFromForm(
    res: Response,
    email: string,
    store: OnDraftSessionStore,
  ): Promise<void>;
  resetPasswordFromForm(
    res: Response,
    token: string,
    password: string,
    confirmPassword: string,
    store: OnDraftSessionStore,
  ): Promise<void>;
  showSettingsModal(
    res: Response,
    store: OnDraftSessionStore,
    flashMessage?: string | null,
    errorMessage?: string | null,
  ): Promise<void>;
  updateMailingListPreferenceFromSettings(
    res: Response,
    store: OnDraftSessionStore,
    subscribe: boolean,
  ): Promise<void>;
  requestEmailVerificationFromSettings(
    res: Response,
    store: OnDraftSessionStore,
  ): Promise<void>;
  unsubscribeMailingListFromRequest(
    res: Response,
    token: string,
    store: OnDraftSessionStore,
  ): Promise<void>;
  exportSubscribedMailingListCsv(res: Response): Promise<void>;
  showAdminUsers(res: Response, store: OnDraftSessionStore): Promise<void>;
  showUserModerationMenu(res: Response, store: OnDraftSessionStore, userId: string, contextId: string): Promise<void>;
  banUserFromForm(res: Response, store: OnDraftSessionStore, userId: string, contextId: string, message: string, duration: string): Promise<void>;
  unbanUserFromForm(res: Response, store: OnDraftSessionStore, userId: string, contextId: string): Promise<void>;
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

  async showForgotPassword(
    res: Response,
    session: IOnDraftBrowserSession,
    pageMessage: string | null = null,
    pageError: string | null = null,
  ): Promise<void> {
    res.render("auth/forgotPassword", { pageMessage, pageError, session });
  }

  async showResetPassword(
    res: Response,
    session: IOnDraftBrowserSession,
    token: string,
    pageError: string | null = null,
  ): Promise<void> {
    res.render("auth/resetPassword", { token, pageError, session });
  }

  async showPasswordResetResult(
    res: Response,
    session: IOnDraftBrowserSession,
    status: "success" | "failure",
    message: string,
  ): Promise<void> {
    res.render("auth/passwordResetResult", { status, message, session });
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
    rememberMe: boolean,
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

    const nextSession = signInAuthenticatedUser(store, result.value, rememberMe);
    this.logger.info(`Authenticated ${nextSession.authenticatedUser?.email ?? "unknown user"}`);
    res.redirect("/");
  }

  async registerFromForm(
    res: Response,
    displayName: string,
    email: string,
    password: string,
    confirmPassword: string,
    mailingListConsent: boolean,
    store: OnDraftSessionStore,
  ): Promise<void> {
    const session = touchOnDraftSession(store);
    const result = await this.service.register({ displayName, email, password, confirmPassword, mailingListConsent });

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

    let nextSession = session;
    if (session.authenticatedUser?.userId === result.value.id) {
      nextSession = signInAuthenticatedUser(
        store,
        result.value,
        session.authenticatedUser.rememberMe,
      );
    }

    this.logger.info("Email verification completed");
    await this.showVerifyEmailResult(
      res,
      nextSession,
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

  async requestPasswordResetFromForm(
    res: Response,
    email: string,
    store: OnDraftSessionStore,
  ): Promise<void> {
    const session = touchOnDraftSession(store);
    const result = await this.service.requestPasswordReset({ email });

    if (result.ok === false) {
      this.logger.error(`Password reset request failed: ${result.value.message}`);
      res.status(500);
      await this.showForgotPassword(res, session, null, "We could not process that request right now.");
      return;
    }

    this.logger.info("Password reset request accepted");
    await this.showForgotPassword(
      res,
      session,
      "If that email is registered, we sent a password reset link.",
      null,
    );
  }

  async resetPasswordFromForm(
    res: Response,
    token: string,
    password: string,
    confirmPassword: string,
    store: OnDraftSessionStore,
  ): Promise<void> {
    const session = touchOnDraftSession(store);
    const result = await this.service.resetPassword({ token, password, confirmPassword });

    if (result.ok === false) {
      const error = result.value;
      const status = this.mapErrorStatus(error);
      const log = status >= 500 ? this.logger.error : this.logger.warn;
      log.call(this.logger, `Password reset failed: ${error.message}`);
      res.status(status);
      if (error.name === "ValidationError" && token.trim()) {
        await this.showResetPassword(res, session, token, error.message);
      } else {
        await this.showPasswordResetResult(res, session, "failure", error.message);
      }
      return;
    }

    this.logger.info("Password reset completed");
    await this.showPasswordResetResult(
      res,
      session,
      "success",
      "Your password has been reset. You can log in with your new password.",
    );
  }

  private renderSettingsModal(
    res: Response,
    session: IOnDraftBrowserSession,
    settings: AccountSettings,
    flashMessage: string | null = null,
    errorMessage: string | null = null,
  ): void {
    res.render("ondraft/partials/settingsModal", {
      layout: false,
      session,
      settings,
      flashMessage,
      errorMessage,
    });
  }

  async showSettingsModal(
    res: Response,
    store: OnDraftSessionStore,
    flashMessage: string | null = null,
    errorMessage: string | null = null,
  ): Promise<void> {
    const session = touchOnDraftSession(store);
    const userId = session.authenticatedUser?.userId;

    if (!userId) {
      res.status(401).render("ondraft/partials/settingsModal", {
        layout: false,
        session,
        settings: { mailingListStatus: "none" },
        flashMessage: null,
        errorMessage: "Log in to manage account settings.",
      });
      return;
    }

    const settings = await this.service.getAccountSettings({ userId });
    if (settings.ok === false) {
      this.logger.error(`Settings load failed: ${settings.value.message}`);
      res.status(this.mapErrorStatus(settings.value));
      this.renderSettingsModal(
        res,
        session,
        { mailingListStatus: "none" },
        null,
        "We could not load settings right now.",
      );
      return;
    }

    this.renderSettingsModal(res, session, settings.value, flashMessage, errorMessage);
  }

  async updateMailingListPreferenceFromSettings(
    res: Response,
    store: OnDraftSessionStore,
    subscribe: boolean,
  ): Promise<void> {
    const session = touchOnDraftSession(store);
    const userId = session.authenticatedUser?.userId;

    if (!userId) {
      await this.showSettingsModal(res, store, null, "Log in to manage account settings.");
      return;
    }

    const result = await this.service.updateMailingListPreference({ userId, subscribe });
    if (result.ok === false) {
      this.logger.error(`Mailing list settings update failed: ${result.value.message}`);
      await this.showSettingsModal(res, store, null, "We could not update your mailing list setting.");
      return;
    }

    const message = subscribe
      ? result.value.mailingListStatus === "pending"
        ? "Mailing list sign-up saved. Verify your email to finish subscribing."
        : "You are subscribed to the OnDraft mailing list."
      : "You are unsubscribed from the OnDraft mailing list.";
    this.renderSettingsModal(res, session, result.value, message, null);
  }

  async requestEmailVerificationFromSettings(
    res: Response,
    store: OnDraftSessionStore,
  ): Promise<void> {
    const session = touchOnDraftSession(store);
    const requestedEmail = session.authenticatedUser?.email ?? "";
    const result = await this.service.requestEmailVerification({ email: requestedEmail });

    if (result.ok === false) {
      this.logger.error(`Settings verification email request failed: ${result.value.message}`);
      await this.showSettingsModal(res, store, null, "We could not send that verification email right now.");
      return;
    }

    await this.showSettingsModal(
      res,
      store,
      "If your email still needs verification, we sent a new verification link.",
      null,
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

  async showAdminUsers(res: Response, store: OnDraftSessionStore): Promise<void> {
    const session = touchOnDraftSession(store);
    const result = await this.service.listAdminUsers();

    if (result.ok === false) {
      this.logger.error(`Admin user list failed: ${result.value.message}`);
      res.status(500).render("ondraft/partials/error", {
        message: "Unable to load users.",
      });
      return;
    }

    res.render("auth/adminUsers", {
      session,
      users: result.value,
    });
  }

  private async findAdminUser(userId: string) {
    const users = await this.service.listAdminUsers();
    if (users.ok === false) {
      return users;
    }

    const user = users.value.find((candidate) => candidate.id === userId) ?? null;
    if (!user) {
      return {
        ok: false as const,
        value: { name: "ValidationError" as const, message: "User not found." },
      };
    }

    return { ok: true as const, value: user };
  }

  private renderUserModerationActions(res: Response, user: AdminUserListItem, contextId: string): void {
    res.render("auth/partials/userModerationActions", {
      layout: false,
      user,
      contextId,
      errorMessage: null,
    });
  }

  async showUserModerationMenu(res: Response, _store: OnDraftSessionStore, userId: string, contextId: string): Promise<void> {
    const user = await this.findAdminUser(userId);
    if (user.ok === false) {
      res.status(this.mapErrorStatus(user.value)).render("auth/partials/userBanMenu", {
        layout: false,
        user: null,
        contextId,
        errorMessage: user.value.message,
      });
      return;
    }

    res.render("auth/partials/userBanMenu", {
      layout: false,
      user: user.value,
      contextId,
      errorMessage: null,
    });
  }

  async banUserFromForm(res: Response, store: OnDraftSessionStore, userId: string, contextId: string, message: string, duration: string): Promise<void> {
    const session = touchOnDraftSession(store);
    const adminUserId = session.authenticatedUser?.userId ?? "";
    const result = await this.service.banUser({
      userId,
      bannedByUserId: adminUserId,
      message,
      duration: duration as BanDuration,
    });

    if (result.ok === false) {
      const user = await this.findAdminUser(userId);
      res.status(result.value.name === "ValidationError" ? 200 : this.mapErrorStatus(result.value)).render("auth/partials/userBanMenu", {
        layout: false,
        user: user.ok === true ? user.value : null,
        contextId,
        errorMessage: result.value.message,
      });
      return;
    }

    const user = await this.findAdminUser(userId);
    if (user.ok === false) {
      res.status(this.mapErrorStatus(user.value)).send(user.value.message);
      return;
    }
    this.renderUserModerationActions(res, user.value, contextId);
  }

  async unbanUserFromForm(res: Response, _store: OnDraftSessionStore, userId: string, contextId: string): Promise<void> {
    const result = await this.service.unbanUser({ userId });
    if (result.ok === false) {
      res.status(this.mapErrorStatus(result.value)).render("auth/partials/userBanMenu", {
        layout: false,
        user: null,
        contextId,
        errorMessage: result.value.message,
      });
      return;
    }

    const user = await this.findAdminUser(userId);
    if (user.ok === false) {
      res.status(this.mapErrorStatus(user.value)).send(user.value.message);
      return;
    }
    this.renderUserModerationActions(res, user.value, contextId);
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
