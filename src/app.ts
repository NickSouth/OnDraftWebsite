import path from "node:path";
import express, { NextFunction, Request, RequestHandler, Response } from "express";
import session from "express-session";
import Layouts from "express-ejs-layouts";
import { IAuthController } from "./auth/AuthController";
import { VerificationResendRateLimiter } from "./auth/VerificationResendRateLimiter";
import { IApp } from "./contracts";
import { IOnDraftController } from "./controller/OnDraftController";
import {
  clientIp,
  compositeRateLimitKey,
  createRateLimitMiddleware,
  normalizedBodyEmail,
  RateLimiter,
} from "./security/RateLimiter";
import { TurnstileVerifier } from "./security/Turnstile";
import { ARTICLE_PDF_MAX_BYTES, articleUpload } from "./uploads/articlePdfUpload";
import { formatRelativeTime } from "./view/formatRelativeTime";
import {
  getAuthenticatedUser,
  isAdminSession,
  recordPageView,
  touchOnDraftSession,
  OnDraftSessionStore,
  STANDARD_SESSION_MAX_AGE_MS,
} from "./session/OnDraftSession";
import { ILoggingService } from "./service/LoggingService";
import type { ITurnstileConfig } from "./config/AppConfig";

type AsyncRequestHandler = RequestHandler;

function asyncHandler(fn: AsyncRequestHandler) {
  return function wrapped(req: Request, res: Response, next: (value?: unknown) => void) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function sessionStore(req: Request): OnDraftSessionStore {
  return req.session as OnDraftSessionStore;
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }

  return "ondraft-template-secret";
}

class ExpressApp implements IApp {
  private readonly app: express.Express;
  private readonly verificationResendRateLimiter = new VerificationResendRateLimiter();
  private readonly loginRateLimit = createRateLimitMiddleware(
    new RateLimiter({
      keyPrefix: "login",
      limit: 20,
      windowMs: 15 * 60 * 1000,
      key: (req) => compositeRateLimitKey(clientIp(req), normalizedBodyEmail(req)),
    }),
  );
  private readonly accountCreationRateLimit = createRateLimitMiddleware(
    new RateLimiter({
      keyPrefix: "account-create",
      limit: 10,
      windowMs: 60 * 60 * 1000,
      key: clientIp,
    }),
  );
  private readonly passwordResetRateLimit = createRateLimitMiddleware(
    new RateLimiter({
      keyPrefix: "password-reset",
      limit: 5,
      windowMs: 60 * 60 * 1000,
      key: (req) => compositeRateLimitKey(clientIp(req), normalizedBodyEmail(req)),
    }),
  );
  private readonly tokenAttemptRateLimit = createRateLimitMiddleware(
    new RateLimiter({
      keyPrefix: "token-attempt",
      limit: 30,
      windowMs: 15 * 60 * 1000,
      key: clientIp,
    }),
  );
  private readonly publicMutationRateLimit = createRateLimitMiddleware(
    new RateLimiter({
      keyPrefix: "public-mutation",
      limit: 120,
      windowMs: 10 * 60 * 1000,
      key: clientIp,
    }),
  );
  private readonly turnstileVerifier: TurnstileVerifier;

  constructor(
    private readonly controller: IOnDraftController,
    private readonly authController: IAuthController,
    private readonly logger: ILoggingService,
    private readonly sessionStore?: session.Store,
    private readonly turnstileConfig: ITurnstileConfig = { siteKey: null, secretKey: null, verificationDisabled: false },
    private readonly siteBaseUrl = "http://localhost:3000",
  ) {
    this.app = express();
    this.turnstileVerifier = new TurnstileVerifier(this.turnstileConfig, this.logger);
    this.registerMiddleware();
    this.registerTemplating();
    this.registerRoutes();
  }

  private registerMiddleware(): void {
    this.app.disable("x-powered-by");
    this.app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
    this.app.use((req, res, next) => this.setSecurityHeaders(req, res, next));
    this.app.use((req, res, next) => this.blockCrossOriginStateChanges(req, res, next));
    this.app.use(express.static(path.join(process.cwd(), "src/static")));
    this.app.use("/vendor/htmx", express.static(path.join(process.cwd(), "node_modules", "htmx.org", "dist")));
    this.app.use("/vendor/alpinejs", express.static(path.join(process.cwd(), "node_modules", "alpinejs", "dist")));
    this.app.use("/vendor/alpinejs-focus", express.static(path.join(process.cwd(), "node_modules", "@alpinejs", "focus", "dist")));
    this.app.use("/vendor/alpinejs-collapse", express.static(path.join(process.cwd(), "node_modules", "@alpinejs", "collapse", "dist")));
    this.app.use("/vendor/pdfjs", express.static(path.join(process.cwd(), "node_modules", "pdfjs-dist")));
    this.app.use(express.static(path.join(process.cwd(), "public"), {
      setHeaders: (res, filePath) => {
        if (path.extname(filePath).toLowerCase() === ".pdf") {
          res.setHeader("Content-Disposition", "inline");
        }
      },
    }));
    this.app.use(
      session({
        name: "ondraft.sid",
        secret: sessionSecret(),
        store: this.sessionStore,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: STANDARD_SESSION_MAX_AGE_MS,
        },
      }),
    );
    this.app.use(Layouts);
    this.app.use(express.urlencoded({ extended: true, limit: "100kb", parameterLimit: 200 }));
    this.app.use((req, res, next) => this.exposeSessionLocals(req, res, next));
  }

  private setSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    next();
  }

  private preventTokenCaching(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader("Cache-Control", "no-store, private");
    next();
  }

  private blockCrossOriginStateChanges(req: Request, res: Response, next: NextFunction): void {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }

    const source = req.get("origin") ?? req.get("referer");
    if (!source) {
      next();
      return;
    }

    try {
      const sourceUrl = new URL(source);
      const sameHost = sourceUrl.host === req.get("host");
      if (sameHost) {
        next();
        return;
      }
    } catch {
      this.logger.warn("Blocked state-changing request with an invalid origin");
      res.status(403).render("ondraft/partials/error", {
        message: "Request blocked.",
        layout: false,
      });
      return;
    }

    this.logger.warn("Blocked cross-origin state-changing request");
    res.status(403).render("ondraft/partials/error", {
      message: "Request blocked.",
      layout: false,
    });
  }

  private registerTemplating(): void {
    this.app.set("view engine", "ejs");
    this.app.set("views", path.join(process.cwd(), "src/views"));
    this.app.set("layout", "layouts/base");
  }

  private requireAdmin(req: Request, res: Response): boolean {
    const store = sessionStore(req);
    const browserSession = touchOnDraftSession(store);

    if (isAdminSession(browserSession)) {
      return true;
    }

    this.logger.warn("Blocked non-admin request to an admin route");
    res.status(403).render("ondraft/partials/error", {
      message: "Admin access is required.",
    });
    return false;
  }

  private handleArticlePdfUpload(req: Request, res: Response, next: NextFunction): void {
    articleUpload.fields([
      { name: "pdf", maxCount: 1 },
      { name: "image", maxCount: 1 },
    ])(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }

      const browserSession = recordPageView(sessionStore(req));
      const message = err instanceof Error && err.name === "MulterError" && err.message === "File too large"
        ? `PDF uploads must be ${Math.floor(ARTICLE_PDF_MAX_BYTES / 1024 / 1024)} MB or smaller.`
        : err instanceof Error
          ? err.message
          : "Unable to upload the PDF article.";

      res.status(400).render("ondraft/createArticle", {
        session: browserSession,
        isAdmin: isAdminSession(browserSession),
        errorMessage: message,
        values: req.body ?? {},
        existingTags: [],
        heading: "Create Article",
        formAction: "/articles/preview",
        saveAction: "/articles",
      });
    });
  }

  private limitVerificationResend(req: Request, res: Response, next: NextFunction): void {
    const result = this.verificationResendRateLimiter.check(req);
    if (!result.limited) {
      next();
      return;
    }

    this.logger.warn("Rate limited verification email resend request");
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    res.status(429).render("auth/verifyEmail", {
      status: "success",
      message: "If that email needs verification, we sent a new verification link.",
      session: touchOnDraftSession(sessionStore(req)),
    });
  }

  private exposeSessionLocals(req: Request, res: Response, next: NextFunction): void {
    const browserSession = touchOnDraftSession(sessionStore(req));
    const currentAbsoluteUrl = new URL(req.originalUrl || req.path, this.siteBaseUrl).toString();
    const defaultPreviewImageUrl = new URL("/images/brand/ondraft-logo.png", this.siteBaseUrl).toString();
    res.locals.isAdmin = isAdminSession(browserSession);
    res.locals.currentPath = req.path;
    res.locals.currentAbsoluteUrl = currentAbsoluteUrl;
    res.locals.defaultPreviewImageUrl = defaultPreviewImageUrl;
    res.locals.relativeTime = formatRelativeTime;
    res.locals.turnstileSiteKey = this.turnstileConfig.verificationDisabled ? null : this.turnstileConfig.siteKey;
    next();
  }

  private renderInfoModal(res: Response, modal: "about" | "privacy" | "contact"): void {
    res.render("ondraft/partials/infoModal", {
      layout: false,
      modal,
    });
  }

  private registerRoutes(): void {
    this.app.get(
      "/",
      asyncHandler(async (req, res) => {
        this.logger.info("GET /");
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showHome(res, browserSession);
      }),
    );

    this.app.get(
      "/about",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        res.render("ondraft/about", { session: browserSession });
      }),
    );
    this.app.get("/privacy", (_req, res) => this.renderInfoModal(res, "privacy"));
    this.app.get("/contact", (_req, res) => this.renderInfoModal(res, "contact"));

    this.app.get(
      "/settings",
      asyncHandler(async (req, res) => {
        await this.authController.showSettingsModal(res, sessionStore(req));
      }),
    );

    this.app.post(
      "/settings/mailing-list",
      asyncHandler(async (req, res) => {
        const subscribe = req.body.preference === "subscribe";
        await this.authController.updateMailingListPreferenceFromSettings(res, sessionStore(req), subscribe);
      }),
    );

    this.app.post(
      "/settings/change-password",
      this.passwordResetRateLimit,
      asyncHandler(async (req, res) => {
        await this.authController.changePasswordFromSettings(
          res,
          sessionStore(req),
        );
      }),
    );

    this.app.post(
      "/settings/resend-verification",
      (req, res, next) => this.limitVerificationResend(req, res, next),
      asyncHandler(async (req, res) => {
        await this.authController.requestEmailVerificationFromSettings(res, sessionStore(req));
      }),
    );

    this.app.get(
      "/login",
      asyncHandler(async (req, res) => {
        const store = sessionStore(req);
        const browserSession = recordPageView(store);

        if (getAuthenticatedUser(store)) {
          res.redirect("/");
          return;
        }

        await this.authController.showLogin(res, browserSession);
      }),
    );

    this.app.post(
      "/login",
      this.loginRateLimit,
      this.turnstileVerifier.middleware(async (_req, res) => {
        await this.authController.showLogin(res, touchOnDraftSession(sessionStore(_req)), "We could not verify this request. Please try again.");
      }),
      asyncHandler(async (req, res) => {
        const email = typeof req.body.email === "string" ? req.body.email : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        const rememberMe = req.body.rememberMe === "on";
        await this.authController.loginFromForm(req, res, email, password, rememberMe);
      }),
    );

    this.app.get(
      "/forgot-password",
      asyncHandler(async (req, res) => {
        const store = sessionStore(req);
        const browserSession = recordPageView(store);
        await this.authController.showForgotPassword(res, browserSession);
      }),
    );

    this.app.post(
      "/forgot-password",
      this.passwordResetRateLimit,
      this.turnstileVerifier.middleware(async (req, res) => {
        await this.authController.showForgotPassword(res, touchOnDraftSession(sessionStore(req)), null, "We could not verify this request. Please try again.");
      }),
      asyncHandler(async (req, res) => {
        const email = typeof req.body.email === "string" ? req.body.email : "";
        await this.authController.requestPasswordResetFromForm(res, email, sessionStore(req));
      }),
    );

    this.app.get(
      "/reset-password",
      this.preventTokenCaching,
      this.tokenAttemptRateLimit,
      asyncHandler(async (req, res) => {
        const store = sessionStore(req);
        const browserSession = recordPageView(store);
        const token = typeof req.query.token === "string" ? req.query.token : "";
        if (!token.trim()) {
          res.status(400);
          await this.authController.showPasswordResetResult(
            res,
            browserSession,
            "failure",
            "We could not reset that password. The link may be expired or already used.",
          );
          return;
        }
        await this.authController.showResetPassword(res, browserSession, token);
      }),
    );

    this.app.post(
      "/reset-password",
      this.preventTokenCaching,
      this.tokenAttemptRateLimit,
      this.turnstileVerifier.middleware(async (req, res) => {
        const token = typeof req.body.token === "string" ? req.body.token : "";
        await this.authController.showResetPassword(res, touchOnDraftSession(sessionStore(req)), token, "We could not verify this request. Please try again.");
      }),
      asyncHandler(async (req, res) => {
        const token = typeof req.body.token === "string" ? req.body.token : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        const confirmPassword = typeof req.body.confirmPassword === "string" ? req.body.confirmPassword : "";
        await this.authController.resetPasswordFromForm(
          res,
          token,
          password,
          confirmPassword,
          sessionStore(req),
        );
      }),
    );

    this.app.get(
      "/register",
      asyncHandler(async (req, res) => {
        const store = sessionStore(req);
        const browserSession = recordPageView(store);

        if (getAuthenticatedUser(store)) {
          res.redirect("/");
          return;
        }

        await this.authController.showRegister(res, browserSession);
      }),
    );

    this.app.post(
      "/register",
      this.accountCreationRateLimit,
      this.turnstileVerifier.middleware(async (req, res) => {
        await this.authController.showRegister(res, touchOnDraftSession(sessionStore(req)), "We could not verify this request. Please try again.");
      }),
      asyncHandler(async (req, res) => {
        const displayName = typeof req.body.displayName === "string" ? req.body.displayName : "";
        const email = typeof req.body.email === "string" ? req.body.email : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        const confirmPassword = typeof req.body.confirmPassword === "string" ? req.body.confirmPassword : "";
        const mailingListConsent = req.body.mailingListConsent === "on";
        await this.authController.registerFromForm(
          req,
          res,
          displayName,
          email,
          password,
          confirmPassword,
          mailingListConsent,
        );
      }),
    );

    this.app.get(
      "/verify-email",
      this.preventTokenCaching,
      this.tokenAttemptRateLimit,
      asyncHandler(async (req, res) => {
        const token = typeof req.query.token === "string" ? req.query.token : "";
        await this.authController.verifyEmailFromRequest(res, token, sessionStore(req));
      }),
    );

    this.app.post(
      "/verify-email",
      this.preventTokenCaching,
      this.tokenAttemptRateLimit,
      asyncHandler(async (req, res) => {
        const token = typeof req.body.token === "string" ? req.body.token : "";
        await this.authController.verifyEmailFromRequest(res, token, sessionStore(req));
      }),
    );

    this.app.post(
      "/verify-email/resend",
      (req, res, next) => this.limitVerificationResend(req, res, next),
      asyncHandler(async (req, res) => {
        const email = typeof req.body.email === "string" ? req.body.email : "";
        await this.authController.requestEmailVerificationFromForm(res, email, sessionStore(req));
      }),
    );

    this.app.get(
      "/mailing-list/unsubscribe",
      this.preventTokenCaching,
      this.tokenAttemptRateLimit,
      asyncHandler(async (req, res) => {
        const token = typeof req.query.token === "string" ? req.query.token : "";
        await this.authController.unsubscribeMailingListFromRequest(res, token, sessionStore(req));
      }),
    );

    this.app.post(
      "/mailing-list/unsubscribe",
      this.preventTokenCaching,
      this.tokenAttemptRateLimit,
      asyncHandler(async (req, res) => {
        const token = typeof req.body.token === "string" ? req.body.token : "";
        await this.authController.unsubscribeMailingListFromRequest(res, token, sessionStore(req));
      }),
    );

    this.app.get(
      "/admin/users",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        await this.authController.showAdminUsers(res, sessionStore(req));
      }),
    );

    this.app.get(
      "/admin/users/:userId/moderation-menu",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
        const contextId = typeof req.query.contextId === "string" ? req.query.contextId : userId;
        await this.authController.showUserModerationMenu(res, sessionStore(req), userId, contextId);
      }),
    );

    this.app.post(
      "/admin/users/:userId/ban",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
        const contextId = typeof req.body.contextId === "string" ? req.body.contextId : userId;
        const message = typeof req.body.message === "string" ? req.body.message : "";
        const duration = typeof req.body.duration === "string" ? req.body.duration : "";
        await this.authController.banUserFromForm(res, sessionStore(req), userId, contextId, message, duration);
      }),
    );

    this.app.post(
      "/admin/users/:userId/unban",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
        const contextId = typeof req.body.contextId === "string" ? req.body.contextId : userId;
        await this.authController.unbanUserFromForm(res, sessionStore(req), userId, contextId);
      }),
    );

    this.app.get(
      "/admin/mailing-list/subscribers.csv",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        await this.authController.exportSubscribedMailingListCsv(res);
      }),
    );

    this.app.post(
      "/logout",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        await this.authController.logoutFromForm(req, res);
      }),
    );

    this.app.get(
      "/articles",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showArticles(req, res, browserSession);
      }),
    );

    this.app.get(
      "/articles/popular",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showPopularArticles(req, res, browserSession);
      }),
    );

    this.app.get(
      "/bookmarks",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showBookmarks(req, res, browserSession);
      }),
    );

    this.app.get(
      "/videos",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showVideos(req, res, browserSession);
      }),
    );

    this.app.get(
      "/videos/new",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showCreateVideoForm(res, browserSession);
      }),
    );

    this.app.get(
      "/videos/:videoId/edit",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        const videoId = Array.isArray(req.params.videoId) ? req.params.videoId[0] : req.params.videoId;
        await this.controller.showEditVideoForm(res, browserSession, videoId);
      }),
    );

    this.app.post(
      "/videos",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.createYoutubeVideo(req, res, browserSession);
      }),
    );

    this.app.post(
      "/videos/:videoId",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.updateYoutubeVideo(req, res, browserSession);
      }),
    );

    this.app.post(
      "/videos/:videoId/delete",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.deleteYoutubeVideo(req, res, browserSession);
      }),
    );

    this.app.get(
      "/videos/:videoId",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showVideo(req, res, browserSession);
      }),
    );

    this.app.get(
      "/hottakes",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showHotTakes(req, res, browserSession);
      }),
    );

    this.app.get(
      "/hottakes/filter",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showFilteredHotTakes(req, res, browserSession);
      }),
    );

    this.app.post(
      "/hottakes",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.createHotTake(req, res, browserSession);
      }),
    );

    this.app.post(
      "/hottakes/:id/like",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.likeHotTake(req, res, browserSession);
      }),
    );

    this.app.post(
      "/hottakes/:id/bookmark",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.toggleForumPostBookmark(req, res, browserSession);
      }),
    );

    this.app.post(
      "/hottakes/:id/comments",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.commentOnHotTake(req, res, browserSession);
      }),
    );

    this.app.delete(
      "/hottakes/:id/comments/:commentId",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.deleteHotTakeComment(req, res, browserSession);
      }),
    );

    this.app.delete(
      "/hottakes/:id",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.deleteHotTake(req, res, browserSession);
      }),
    );

    this.app.get(
      "/articles/filter",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showFilteredArticles(req, res, browserSession);
      }),
    );

    this.app.get(
      "/articles/new",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showCreateArticleForm(res, browserSession);
      }),
    );

    this.app.get(
      "/articles/new/content-fields",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const contentType = req.query.contentType === "pdf" || req.query.contentType === "html"
          ? req.query.contentType
          : "plainText";
        res.render("ondraft/partials/articleContentFields", {
          layout: false,
          values: { contentType },
        });
      }),
    );

    this.app.get(
      "/articles/:id/edit",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        await this.controller.showEditArticleForm(res, browserSession, id);
      }),
    );

    this.app.post(
      "/articles",
      (req, res, next) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        this.handleArticlePdfUpload(req, res, next);
      },
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.createArticle(req, res, browserSession);
      }),
    );

    this.app.post(
      "/articles/preview",
      (req, res, next) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        this.handleArticlePdfUpload(req, res, next);
      },
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.previewArticle(req, res, browserSession);
      }),
    );

    this.app.post(
      "/articles/:id/preview",
      (req, res, next) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        this.handleArticlePdfUpload(req, res, next);
      },
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.previewArticle(req, res, browserSession);
      }),
    );

    this.app.post(
      "/articles/:id",
      (req, res, next) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        this.handleArticlePdfUpload(req, res, next);
      },
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.updateArticle(req, res, browserSession);
      }),
    );

    this.app.delete(
      "/articles/:id",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.deleteArticle(req, res, browserSession);
      }),
    );

    this.app.get(
      "/articles/:id/preview",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        await this.controller.showArticlePreview(res, browserSession, id);
      }),
    );

    this.app.post(
      "/articles/:id/like",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.likeArticle(req, res, browserSession);
      }),
    );

    this.app.post(
      "/articles/:id/bookmark",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.toggleArticleBookmark(req, res, browserSession);
      }),
    );

    this.app.get(
      "/articles/:id/comments",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showArticleComments(req, res, browserSession);
      }),
    );

    this.app.post(
      "/articles/:id/comments",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.commentOnArticle(req, res, browserSession);
      }),
    );

    this.app.post(
      "/articles/:id/comments/:commentId/replies",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.commentReply(req, res, browserSession);
      }),
    );

    this.app.post(
      "/comments/:commentId/like",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.likeComment(req, res, browserSession);
      }),
    );

    this.app.delete(
      "/articles/:id/comments/:commentId",
      this.publicMutationRateLimit,
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.deleteComment(req, res, browserSession);
      }),
    );

    this.app.get(
      "/articles/:id",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        await this.controller.showOneArticle(res, browserSession, id);
      }),
    );

    this.app.get(
      "/bigboard/edit",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showEditBigBoard(req, res, browserSession);
      }),
    );

    this.app.post(
      "/bigboard/years",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.createBigBoardYear(req, res, browserSession);
      }),
    );

    this.app.post(
      "/bigboard/years/delete",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.deleteBigBoardYear(req, res, browserSession);
      }),
    );

    this.app.post(
      "/bigboard/edit",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.saveBigBoard(req, res, browserSession);
      }),
    );

    this.app.post(
      "/bigboard/edit/autosave",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.autosaveBigBoard(req, res, browserSession);
      }),
    );

    this.app.post(
      "/bigboard/edit/publish-player-info",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.publishBigBoardPlayerInfo(req, res, browserSession);
      }),
    );

    this.app.post(
      "/bigboard/edit/publish-writeup",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.publishBigBoardWriteup(req, res, browserSession);
      }),
    );

    this.app.get(
      "/bigboard",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showBigBoard(req, res, browserSession);
      }),
    );

    this.app.get(
      "/bigboard/new",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showCreateBigBoardEntryForm(res, browserSession);
      }),
    );

    this.app.post(
      "/bigboard",
      asyncHandler(async (req, res) => {
        if (!this.requireAdmin(req, res)) {
          return;
        }

        const browserSession = recordPageView(sessionStore(req));
        await this.controller.createBigBoardEntry(req, res, browserSession);
      }),
    );

    this.app.use((req, res) => {
      const browserSession = recordPageView(sessionStore(req));
      res.status(404).render("ondraft/notFound", {
        session: browserSession,
        isAdmin: isAdminSession(browserSession),
        title: "Page not found",
        message: "This tap is kicked. The page you wanted is not on the board.",
        backHref: "/",
        backLabel: "Back home",
      });
    });

    this.app.use((err: unknown, _req: Request, res: Response, _next: (value?: unknown) => void) => {
      const message = err instanceof Error ? err.message : "Unexpected server error.";
      const status = typeof (err as { status?: unknown }).status === "number"
        ? (err as { status: number }).status
        : typeof (err as { statusCode?: unknown }).statusCode === "number"
          ? (err as { statusCode: number }).statusCode
          : 500;
      if (status === 413) {
        this.logger.warn("Rejected oversized request body");
        res.status(413).render("ondraft/partials/error", {
          message: "Request body is too large.",
          layout: false,
        });
        return;
      }
      this.logger.error(message);
      res.status(500).render("ondraft/partials/error", {
        message: "Unexpected server error.",
        layout: false,
      });
    });
  }

  getExpressApp(): express.Express {
    return this.app;
  }
}

export function CreateApp(
  controller: IOnDraftController,
  authController: IAuthController,
  logger: ILoggingService,
  sessionStore?: session.Store,
  turnstileConfig?: ITurnstileConfig,
  siteBaseUrl?: string,
): IApp {
  return new ExpressApp(controller, authController, logger, sessionStore, turnstileConfig, siteBaseUrl);
}
