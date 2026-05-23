export type RepositoryMode = "memory" | "prisma";
export type EmailProvider = "logging" | "resend";

export interface IEmailConfig {
  provider: EmailProvider;
  from: string | null;
  appBaseUrl: string;
  resendApiKey: string | null;
  verificationTokenTtlHours: number;
  mailingListUnsubscribeSecret: string;
}

export interface IAppConfig {
  port: number;
  repositoryMode: RepositoryMode;
  email: IEmailConfig;
}

function readOptionalEnv(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string, errors: string[]): string | null {
  const value = readOptionalEnv(env, key);
  if (!value) {
    errors.push(`${key} is required.`);
  }
  return value;
}

function parsePort(env: NodeJS.ProcessEnv, errors: string[]): number {
  const raw = readOptionalEnv(env, "PORT");
  if (!raw) {
    return 3000;
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0) {
    errors.push("PORT must be a positive integer.");
    return 3000;
  }

  return port;
}

function parsePositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: number,
  errors: string[],
): number {
  const raw = readOptionalEnv(env, key);
  if (!raw) {
    return defaultValue;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    errors.push(`${key} must be a positive integer.`);
    return defaultValue;
  }

  return value;
}

function parseRepositoryMode(env: NodeJS.ProcessEnv): RepositoryMode {
  return env.REPO_MODE === "memory" ? "memory" : "prisma";
}

function parseEmailProvider(env: NodeJS.ProcessEnv, errors: string[]): EmailProvider {
  const rawProvider = readOptionalEnv(env, "EMAIL_PROVIDER");
  if (!rawProvider) {
    return env.NODE_ENV === "production" ? "resend" : "logging";
  }

  if (rawProvider === "logging" || rawProvider === "resend") {
    return rawProvider;
  }

  errors.push("EMAIL_PROVIDER must be either logging or resend.");
  return "logging";
}

function parseUrl(value: string | null, key: string, errors: string[]): void {
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      errors.push(`${key} must use http or https.`);
    }
  } catch {
    errors.push(`${key} must be a valid URL.`);
  }
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): IAppConfig {
  const errors: string[] = [];
  const port = parsePort(env, errors);
  const provider = parseEmailProvider(env, errors);
  const from = readOptionalEnv(env, "EMAIL_FROM");
  const appBaseUrl = readOptionalEnv(env, "APP_BASE_URL") ?? "http://localhost:3000";
  const resendApiKey = readOptionalEnv(env, "RESEND_API_KEY");
  const mailingListUnsubscribeSecret = readOptionalEnv(env, "MAILING_LIST_UNSUBSCRIBE_SECRET")
    ?? readOptionalEnv(env, "SESSION_SECRET")
    ?? "ondraft-local-mailing-list-unsubscribe-secret";
  const verificationTokenTtlHours = parsePositiveIntegerEnv(
    env,
    "EMAIL_VERIFICATION_TOKEN_TTL_HOURS",
    24,
    errors,
  );

  if (provider === "resend") {
    requireEnv(env, "EMAIL_FROM", errors);
    requireEnv(env, "RESEND_API_KEY", errors);
  }

  if (env.NODE_ENV === "production") {
    requireEnv(env, "APP_BASE_URL", errors);
    if (!readOptionalEnv(env, "MAILING_LIST_UNSUBSCRIBE_SECRET") && !readOptionalEnv(env, "SESSION_SECRET")) {
      errors.push("MAILING_LIST_UNSUBSCRIBE_SECRET or SESSION_SECRET is required.");
    }
  }

  parseUrl(appBaseUrl, "APP_BASE_URL", errors);

  if (env.NODE_ENV === "production" && provider === "logging") {
    errors.push("EMAIL_PROVIDER=logging is not allowed in production.");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid app configuration: ${errors.join(" ")}`);
  }

  return {
    port,
    repositoryMode: parseRepositoryMode(env),
    email: {
      provider,
      from,
      appBaseUrl,
      resendApiKey,
      verificationTokenTtlHours,
      mailingListUnsubscribeSecret,
    },
  };
}
