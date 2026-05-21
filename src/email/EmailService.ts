import type { IEmailConfig } from "../config/AppConfig";
import type { ILoggingService } from "../service/LoggingService";

export interface SendEmailVerificationEmailInput {
  to: string;
  verificationUrl: string;
}

export interface IEmailService {
  sendEmailVerificationEmail(input: SendEmailVerificationEmailInput): Promise<void>;
}

class LoggingEmailService implements IEmailService {
  constructor(private readonly logger: ILoggingService) {}

  async sendEmailVerificationEmail(input: SendEmailVerificationEmailInput): Promise<void> {
    this.logger.info(`Email verification URL for ${input.to}: ${redactVerificationToken(input.verificationUrl)}`);
  }
}

class ResendEmailService implements IEmailService {
  constructor(
    private readonly config: IEmailConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async sendEmailVerificationEmail(input: SendEmailVerificationEmailInput): Promise<void> {
    if (!this.config.from || !this.config.resendApiKey) {
      throw new Error("Resend email service is missing required configuration.");
    }

    const response = await this.fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.from,
        to: input.to,
        subject: "Verify your OnDraft email",
        html: renderEmailVerificationHtml(input.verificationUrl),
        text: renderEmailVerificationText(input.verificationUrl),
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend email request failed with status ${response.status}.`);
    }
  }
}

function renderEmailVerificationHtml(verificationUrl: string): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<body>",
    "<h1>Verify your OnDraft email</h1>",
    "<p>Use the link below to verify your email address.</p>",
    `<p><a href="${escapeHtmlAttribute(verificationUrl)}">Verify email</a></p>`,
    "<p>If you did not create an OnDraft account, you can ignore this email.</p>",
    "</body>",
    "</html>",
  ].join("");
}

function renderEmailVerificationText(verificationUrl: string): string {
  return [
    "Verify your OnDraft email",
    "",
    "Use the link below to verify your email address.",
    verificationUrl,
    "",
    "If you did not create an OnDraft account, you can ignore this email.",
  ].join("\n");
}

function redactVerificationToken(verificationUrl: string): string {
  try {
    const url = new URL(verificationUrl);
    if (url.searchParams.has("token")) {
      url.searchParams.set("token", "[redacted]");
    }
    return url.toString();
  } catch {
    return "[redacted-verification-url]";
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function CreateEmailService(
  config: IEmailConfig,
  logger: ILoggingService,
  fetcher: typeof fetch = fetch,
): IEmailService {
  if (config.provider === "resend") {
    return new ResendEmailService(config, fetcher);
  }

  return new LoggingEmailService(logger);
}
