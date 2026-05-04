import path from "node:path";
import express, { NextFunction, Request, RequestHandler, Response } from "express";
import session from "express-session";
import Layouts from "express-ejs-layouts";
import { IAuthController } from "./auth/AuthController";
import { IApp } from "./contracts";
import { IWebsiteController } from "./controller/WebsiteController";
import { ARTICLE_PDF_MAX_BYTES, articleUpload } from "./uploads/articlePdfUpload";
import {
  getAuthenticatedUser,
  isAdminSession,
  recordPageView,
  touchWebsiteSession,
  WebsiteSessionStore,
} from "./session/WebsiteSession";
import { ILoggingService } from "./service/LoggingService";

type AsyncRequestHandler = RequestHandler;

function asyncHandler(fn: AsyncRequestHandler) {
  return function wrapped(req: Request, res: Response, next: (value?: unknown) => void) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function sessionStore(req: Request): WebsiteSessionStore {
  return req.session as WebsiteSessionStore;
}

class ExpressApp implements IApp {
  private readonly app: express.Express;

  constructor(
    private readonly controller: IWebsiteController,
    private readonly authController: IAuthController,
    private readonly logger: ILoggingService,
  ) {
    this.app = express();
    this.registerMiddleware();
    this.registerTemplating();
    this.registerRoutes();
  }

  private registerMiddleware(): void {
    this.app.use(express.static(path.join(process.cwd(), "src/static")));
    this.app.use("/vendor/htmx", express.static(path.join(process.cwd(), "node_modules", "htmx.org", "dist")));
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
        name: "website.sid",
        secret: process.env.SESSION_SECRET ?? "cheekscast-template-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          sameSite: "lax",
        },
      }),
    );
    this.app.use(Layouts);
    this.app.use(express.urlencoded({ extended: true }));
  }

  private registerTemplating(): void {
    this.app.set("view engine", "ejs");
    this.app.set("views", path.join(process.cwd(), "src/views"));
    this.app.set("layout", "layouts/base");
  }

  private requireAdmin(req: Request, res: Response): boolean {
    const store = sessionStore(req);
    const browserSession = touchWebsiteSession(store);

    if (isAdminSession(browserSession)) {
      return true;
    }

    this.logger.warn("Blocked non-admin request to an admin route");
    res.status(403).render("website/partials/error", {
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

      res.status(400).render("website/createArticle", {
        session: browserSession,
        isAdmin: isAdminSession(browserSession),
        errorMessage: message,
        values: req.body ?? {},
        existingTags: [],
      });
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
        await this.authController.loginFromForm(res, email, password, sessionStore(req));
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
        await this.authController.registerFromForm(
          res,
          displayName,
          email,
          password,
          sessionStore(req),
        );
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
        await this.controller.showArticles(res, browserSession);
      }),
    );

    this.app.get(
      "/articles/filter",
      asyncHandler(async (req, res) => {
        await this.controller.showFilteredArticles(req, res);
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
        res.render("website/partials/articleContentFields", {
          layout: false,
          values: { contentType },
        });
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

    this.app.get(
      "/articles/:id",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        await this.controller.showOneArticle(res, browserSession, id);
      }),
    );

    this.app.get(
      "/bigboard",
      asyncHandler(async (req, res) => {
        const browserSession = recordPageView(sessionStore(req));
        await this.controller.showBigBoard(res, browserSession);
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
      res.status(500).render("website/partials/error", {
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
  controller: IWebsiteController,
  authController: IAuthController,
  logger: ILoggingService,
): IApp {
  return new ExpressApp(controller, authController, logger);
}
