import type { Request } from "express";
import { getAuthenticatedUser } from "../session/OnDraftSession";
import type { OnDraftSessionStore } from "../session/OnDraftSession";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface VerificationResendRateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
}

export class VerificationResendRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly ipLimit = 6,
    private readonly emailLimit = 3,
    private readonly windowMs = 60 * 60 * 1000,
  ) {}

  check(req: Request): VerificationResendRateLimitResult {
    const email = this.emailKey(req);
    const keys = [`ip:${req.ip ?? "unknown"}`, `email:${email}`];
    const checks = keys.map((key) => this.peek(key));
    const limited = checks.find((bucket) => bucket.limited);

    if (limited) {
      return limited;
    }

    for (const key of keys) {
      this.increment(key);
    }

    return { limited: false, retryAfterSeconds: 0 };
  }

  private emailKey(req: Request): string {
    const sessionUser = getAuthenticatedUser(req.session as OnDraftSessionStore);
    const bodyEmail = typeof req.body?.email === "string" ? req.body.email : "";
    return (sessionUser?.email ?? bodyEmail).trim().toLowerCase();
  }

  private peek(key: string): VerificationResendRateLimitResult {
    const bucket = this.bucket(key);
    const limit = key.startsWith("ip:") ? this.ipLimit : this.emailLimit;
    if (bucket.count >= limit) {
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - this.now()) / 1000)),
      };
    }
    return { limited: false, retryAfterSeconds: 0 };
  }

  private increment(key: string): void {
    this.bucket(key).count += 1;
  }

  private bucket(key: string): RateLimitBucket {
    const now = this.now();
    const existing = this.buckets.get(key);
    if (existing && existing.resetAt > now) {
      return existing;
    }

    const created = {
      count: 0,
      resetAt: now + this.windowMs,
    };
    this.buckets.set(key, created);
    return created;
  }
}
