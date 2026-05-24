import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ITurnstileConfig } from "../config/AppConfig";
import type { ILoggingService } from "../service/LoggingService";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ERROR_MESSAGE = "We could not verify this request. Please try again.";

interface TurnstileSiteVerifyResponse {
  success?: boolean;
  "error-codes"?: string[];
}

function tokenFromRequest(req: Request): string {
  return typeof req.body?.["cf-turnstile-response"] === "string"
    ? req.body["cf-turnstile-response"].trim()
    : "";
}

type TurnstileFailureHandler = (req: Request, res: Response) => void | Promise<void>;

function renderTurnstileFailure(res: Response): void {
  res.status(400).render("ondraft/partials/error", {
    message: TURNSTILE_ERROR_MESSAGE,
    layout: false,
  });
}

export class TurnstileVerifier {
  constructor(
    private readonly config: ITurnstileConfig,
    private readonly logger: ILoggingService,
    private readonly verifyUrl = TURNSTILE_VERIFY_URL,
  ) {}

  get isEnabled(): boolean {
    return !this.config.verificationDisabled && Boolean(this.config.siteKey && this.config.secretKey);
  }

  middleware(onFailure?: TurnstileFailureHandler): RequestHandler {
    // Server-side Turnstile verification happens here before protected auth forms are accepted.
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!this.isEnabled) {
        next();
        return;
      }

      const token = tokenFromRequest(req);
      if (!token) {
        this.logger.warn("Blocked protected form submission without a Turnstile token");
        await this.fail(req, res, onFailure);
        return;
      }

      try {
        const body = new URLSearchParams({
          secret: this.config.secretKey ?? "",
          response: token,
        });
        if (req.ip) {
          body.set("remoteip", req.ip);
        }

        const response = await fetch(this.verifyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });

        if (!response.ok) {
          this.logger.warn(`Turnstile verification failed with status ${response.status}`);
          await this.fail(req, res, onFailure);
          return;
        }

        const result = await response.json() as TurnstileSiteVerifyResponse;
        if (result.success !== true) {
          this.logger.warn("Turnstile verification rejected a protected form submission");
          await this.fail(req, res, onFailure);
          return;
        }

        next();
      } catch {
        this.logger.warn("Turnstile verification request failed");
        await this.fail(req, res, onFailure);
      }
    };
  }

  private async fail(req: Request, res: Response, onFailure?: TurnstileFailureHandler): Promise<void> {
    res.status(400);
    if (onFailure) {
      await onFailure(req, res);
      return;
    }
    renderTurnstileFailure(res);
  }
}
