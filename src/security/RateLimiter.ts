import type { Request, RequestHandler } from "express";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
  key?: (req: Request) => string;
  now?: () => number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly keyPrefix: string;
  private readonly key: (req: Request) => string;
  private readonly now: () => number;

  constructor(private readonly options: RateLimiterOptions) {
    this.keyPrefix = options.keyPrefix ?? "rate";
    this.key = options.key ?? ((req) => req.ip ?? "unknown");
    this.now = options.now ?? (() => Date.now());
  }

  check(req: Request): RateLimitResult {
    const key = `${this.keyPrefix}:${this.key(req)}`;
    const bucket = this.bucket(key);

    if (bucket.count >= this.options.limit) {
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - this.now()) / 1000)),
      };
    }

    bucket.count += 1;
    return { limited: false, retryAfterSeconds: 0 };
  }

  private bucket(key: string): RateLimitBucket {
    const now = this.now();
    const existing = this.buckets.get(key);
    if (existing && existing.resetAt > now) {
      return existing;
    }

    const created = {
      count: 0,
      resetAt: now + this.options.windowMs,
    };
    this.buckets.set(key, created);
    return created;
  }
}

export function normalizedBodyEmail(req: Request): string {
  return typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
}

export function clientIp(req: Request): string {
  return req.ip ?? "unknown";
}

export function compositeRateLimitKey(...parts: Array<string | null | undefined>): string {
  return parts.map((part) => part?.trim() || "unknown").join(":");
}

export function createRateLimitMiddleware(
  limiter: RateLimiter,
  options: {
    message?: string;
    onLimited?: RequestHandler;
  } = {},
): RequestHandler {
  return (req, res, next) => {
    const result = limiter.check(req);
    if (!result.limited) {
      next();
      return;
    }

    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    if (options.onLimited) {
      options.onLimited(req, res, next);
      return;
    }

    res.status(429).render("ondraft/partials/error", {
      message: options.message ?? "Too many requests. Please try again soon.",
      layout: false,
    });
  };
}
