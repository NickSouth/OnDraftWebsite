import path from "node:path";
import express, { NextFunction, Request, RequestHandler, Response } from "express";
import session from "express-session";
import Layouts from "express-ejs-layouts";
import { IAuthController } from "./auth/AuthController";
import { VerificationResendRateLimiter } from "./auth/VerificationResendRateLimiter";
import { IApp } from "./contracts";
import { IOnDraftController } from "./controller/OnDraftController";
import { ARTICLE_PDF_MAX_BYTES, articleUpload } from "./uploads/articlePdfUpload";
import {
  getAuthenticatedUser,
  isAdminSession,
  recordPageView,
  touchOnDraftSession,
  OnDraftSessionStore,
  STANDARD_SESSION_MAX_AGE_MS,
} from "./session/OnDraftSession";
import { ILoggingService } from "./service/LoggingService";

type AsyncRequestHandler = RequestHandler;

function asyncHandler(fn: AsyncRequestHandler) {
  return function wrapped(req: Request, res: Response, next: (value?: unknown) => void) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function sessionStore(req: Request): OnDraftSessionStore {
  return req.session as OnDraftSessionStore;
}

class ExpressApp implements IApp {
  private readonly app: express.Express;
  private readonly verificationResendRateLimiter = new VerificationResendRateLimiter();

  constructor(
    private readonly controller: IOnDraftController,
    private readonly authController: IAuthController,
    private readonly logger: ILoggingService,
    private readonly sessionStore?: session.Store,
  ) {
    this.app = express();
    this.registerMiddleware();
    this.registerTemplating();
    this.registerRoutes();
  }

  private registerMiddleware(): void {
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
        secret: process.env.SESSION_SECRET ?? "ondraft-template-secret",
        store: this.sessionStore,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
          httpOnly: true,
          sameSite: "lax",
          maxAge: STANDARD_SESSION_MAX_AGE_MS,
        },
      }),
    );
    this.app.use(Layouts);
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use((req, res, next) => this.exposeSessionLocals(req, res, next));
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
    res.locals.isAdmin = isAdminSession(browserSession);
    res.locals.currentPath = req.path;
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

    this.app.get("/about", (_req, res) => this.renderInfoModal(res, "about"));
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
      "/settings/resend-verification",
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
      asyncHandler(async (req, res) => {
        const email = typeof req.body.email === "string" ? req.body.email : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        const rememberMe = req.body.rememberMe === "on";
        await this.authController.loginFromForm(res, email, password, rememberMe, sessionStore(req));
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
      asyncHandler(async (req, res) => {
        const displayName = typeof req.body.displayName === "string" ? req.body.displayName : "";
        const email = typeof req.body.email === "string" ? req.body.email : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        const confirmPassword = typeof req.body.confirmPassword === "string" ? req.body.confirmPassword : "";
        const mailingListConsent = req.body.mailingListConsent === "on";
        await this.authController.registerFromForm(
          res,
          displayName,
          email,
          password,
          confirmPassword,
          mailingListConsent,
          sessionStore(req),
        );
      }),
    );

    this.app.get(
      "/verify-email",
      asyncHandler(async (req, res) => {
        const token = typeof req.query.token === "string" ? req.query.token : "";
        await this.authController.verifyEmailFromRequest(res, token, sessionStore(req));
      }),
    );

    this.app.post(
      "/verify-email",
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
      asyncHandler(async (req, res) => {
        const token = typeof req.query.token === "string" ? req.query.token : "";
        await this.authController.unsubscribeMailingListFromRequest(res, token, sessionStore(req));
      }),
    );

    this.app.post(
      "/mailing-list/unsubscribe",
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
      asyncHandler(async (req, res) => {
        await this.authController.logoutFromForm(res, sessionStore(req));
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
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.createHotTake(req, res, browserSession);
      }),
    );

    this.app.post(
      "/hottakes/:id/like",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.likeHotTake(req, res, browserSession);
      }),
    );

    this.app.post(
      "/hottakes/:id/bookmark",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.toggleForumPostBookmark(req, res, browserSession);
      }),
    );

    this.app.post(
      "/hottakes/:id/comments",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.commentOnHotTake(req, res, browserSession);
      }),
    );

    this.app.delete(
      "/hottakes/:id",
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
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.likeArticle(req, res, browserSession);
      }),
    );

    this.app.post(
      "/articles/:id/bookmark",
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
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.commentOnArticle(req, res, browserSession);
      }),
    );

    this.app.post(
      "/articles/:id/comments/:commentId/replies",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.commentReply(req, res, browserSession);
      }),
    );

    this.app.post(
      "/comments/:commentId/like",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.likeComment(req, res, browserSession);
      }),
    );

    this.app.delete(
      "/articles/:id/comments/:commentId",
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

    this.app.use((err: unknown, _req: Request, res: Response, _next: (value?: unknown) => void) => {
      const message = err instanceof Error ? err.message : "Unexpected server error.";
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
): IApp {
  return new ExpressApp(controller, authController, logger, sessionStore);
}
