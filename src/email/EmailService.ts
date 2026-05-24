import type { IEmailConfig } from "../config/AppConfig";
import type { ILoggingService } from "../service/LoggingService";

export interface SendEmailVerificationEmailInput {
  to: string;
  verificationUrl: string;
}

export interface SendPasswordResetEmailInput {
  to: string;
  resetUrl: string;
}

export interface IEmailService {
  sendEmailVerificationEmail(input: SendEmailVerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void>;
}

class LoggingEmailService implements IEmailService {
  constructor(private readonly logger: ILoggingService) {}

  async sendEmailVerificationEmail(input: SendEmailVerificationEmailInput): Promise<void> {
    this.logger.info(`Email verification URL for ${input.to}: ${redactVerificationToken(input.verificationUrl)}`);
  }

  async sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
    this.logger.info(`Password reset URL for ${input.to}: ${redactToken(input.resetUrl)}`);
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

  async sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
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
        subject: "Reset your OnDraft password",
        html: renderPasswordResetHtml(input.resetUrl),
        text: renderPasswordResetText(input.resetUrl),
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend email request failed with status ${response.status}.`);
    }
  }
}

function renderEmailVerificationHtml(verificationUrl: string): string {
  const escapedVerificationUrl = escapeHtmlAttribute(verificationUrl);
  const escapedLogoUrl = escapeHtmlAttribute(buildBrandLogoUrl(verificationUrl));
  return [
    "<!doctype html>",
    '<html lang="en">',
    '<body style="margin:0;background:#f8fafc;color:#0b1220;font-family:Segoe UI,Inter,Arial,sans-serif;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;margin:0;padding:32px 16px;">',
    "<tr>",
    '<td align="center">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;overflow:hidden;border:1px solid #cbd5e1;border-radius:8px;background:#ffffff;box-shadow:0 24px 70px rgba(7,17,31,0.14);">',
    "<tr>",
    '<td style="background:#0b1220;padding:28px 28px 24px;border-bottom:4px solid #d99822;">',
    `<img src="${escapedLogoUrl}" width="96" height="57" alt="OnDraft Football" style="display:block;width:96px;height:auto;margin:0 0 14px;border:0;" />`,
    '<p style="margin:0 0 8px;color:#d99822;font-size:12px;font-weight:900;letter-spacing:0.16em;text-transform:uppercase;">OnDraft Football</p>',
    '<h1 style="margin:0;color:#ffffff;font-family:Georgia,Cambria,Times New Roman,serif;font-size:32px;line-height:1.1;font-weight:900;">Verify your OnDraft email</h1>',
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:28px;">',
    '<p style="margin:0;color:#334155;font-size:16px;line-height:1.6;font-weight:600;">Use the button below to verify your email address and finish setting up your OnDraft account.</p>',
    '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;">',
    "<tr>",
    `<td style="border-radius:6px;background:#d99822;"><a href="${escapedVerificationUrl}" style="display:inline-block;padding:13px 22px;color:#0b1220;font-size:15px;font-weight:800;text-decoration:none;">Verify email</a></td>`,
    "</tr>",
    "</table>",
    `<p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">If the button does not work, paste this link into your browser:<br><a href="${escapedVerificationUrl}" style="color:#a75f12;font-weight:700;word-break:break-all;">${escapedVerificationUrl}</a></p>`,
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="border-top:1px solid #e2e8f0;background:#f8fafc;padding:18px 28px;">',
    '<p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">If you did not create an OnDraft account, you can ignore this email.</p>',
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
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

function renderPasswordResetHtml(resetUrl: string): string {
  const escapedResetUrl = escapeHtmlAttribute(resetUrl);
  const escapedLogoUrl = escapeHtmlAttribute(buildBrandLogoUrl(resetUrl));
  return [
    "<!doctype html>",
    '<html lang="en">',
    '<body style="margin:0;background:#f8fafc;color:#0b1220;font-family:Segoe UI,Inter,Arial,sans-serif;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;margin:0;padding:32px 16px;">',
    "<tr>",
    '<td align="center">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;overflow:hidden;border:1px solid #cbd5e1;border-radius:8px;background:#ffffff;box-shadow:0 24px 70px rgba(7,17,31,0.14);">',
    "<tr>",
    '<td style="background:#0b1220;padding:28px 28px 24px;border-bottom:4px solid #d99822;">',
    `<img src="${escapedLogoUrl}" width="96" height="57" alt="OnDraft Football" style="display:block;width:96px;height:auto;margin:0 0 14px;border:0;" />`,
    '<p style="margin:0 0 8px;color:#d99822;font-size:12px;font-weight:900;letter-spacing:0.16em;text-transform:uppercase;">OnDraft Football</p>',
    '<h1 style="margin:0;color:#ffffff;font-family:Georgia,Cambria,Times New Roman,serif;font-size:32px;line-height:1.1;font-weight:900;">Reset your password</h1>',
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:28px;">',
    '<p style="margin:0;color:#334155;font-size:16px;line-height:1.6;font-weight:600;">Use the button below to choose a new password for your OnDraft account.</p>',
    '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;">',
    "<tr>",
    `<td style="border-radius:6px;background:#d99822;"><a href="${escapedResetUrl}" style="display:inline-block;padding:13px 22px;color:#0b1220;font-size:15px;font-weight:800;text-decoration:none;">Reset password</a></td>`,
    "</tr>",
    "</table>",
    `<p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">This link expires soon and can only be used once. If the button does not work, paste this link into your browser:<br><a href="${escapedResetUrl}" style="color:#a75f12;font-weight:700;word-break:break-all;">${escapedResetUrl}</a></p>`,
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="border-top:1px solid #e2e8f0;background:#f8fafc;padding:18px 28px;">',
    '<p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">If you did not request a password reset, you can ignore this email.</p>',
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("");
}

function renderPasswordResetText(resetUrl: string): string {
  return [
    "Reset your OnDraft password",
    "",
    "Use the link below to choose a new password for your account.",
    resetUrl,
    "",
    "This link expires soon and can only be used once. If you did not request a password reset, you can ignore this email.",
  ].join("\n");
}

function redactVerificationToken(verificationUrl: string): string {
  return redactToken(verificationUrl);
}

function buildBrandLogoUrl(actionUrl: string): string {
  return new URL("/images/brand/ondraft-logo.png", actionUrl).toString();
}

function redactToken(verificationUrl: string): string {
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
