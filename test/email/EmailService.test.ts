import { CreateEmailService } from "../../src/email/EmailService";
import type { ILoggingService } from "../../src/service/LoggingService";

function testLogger() {
  const messages: string[] = [];
  const logger: ILoggingService = {
    info: (message) => messages.push(message),
    warn: (message) => messages.push(message),
    error: (message) => messages.push(message),
  };

  return { logger, messages };
}

describe("EmailService", () => {
  it("redacts raw verification tokens in safe logging mode", async () => {
    const { logger, messages } = testLogger();
    const service = CreateEmailService({
      provider: "logging",
      from: null,
      appBaseUrl: "http://localhost:3000",
      resendApiKey: null,
      verificationTokenTtlHours: 24,
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "test-mailing-secret",
    }, logger);

    await service.sendEmailVerificationEmail({
      to: "reader@ondraft.test",
      verificationUrl: "https://ondraftfootball.com/verify-email?token=example",
    });

    expect(messages).toContain(
      "Email verification URL for reader@ondraft.test: https://ondraftfootball.com/verify-email?token=%5Bredacted%5D",
    );
    expect(messages.join("\n")).not.toContain("token=example");
  });

  it("redacts raw password reset tokens in safe logging mode", async () => {
    const { logger, messages } = testLogger();
    const service = CreateEmailService({
      provider: "logging",
      from: null,
      appBaseUrl: "http://localhost:3000",
      resendApiKey: null,
      verificationTokenTtlHours: 24,
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "test-mailing-secret",
    }, logger);

    await service.sendPasswordResetEmail({
      to: "reader@ondraft.test",
      resetUrl: "https://ondraftfootball.com/reset-password?token=example",
    });

    expect(messages).toContain(
      "Password reset URL for reader@ondraft.test: https://ondraftfootball.com/reset-password?token=%5Bredacted%5D",
    );
    expect(messages.join("\n")).not.toContain("token=example");
  });

  it("sends a server-rendered Resend request without exposing API keys in code", async () => {
    const { logger } = testLogger();
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const service = CreateEmailService({
      provider: "resend",
      from: "OnDraft <no-reply@ondraftfootball.com>",
      appBaseUrl: "https://ondraftfootball.com",
      resendApiKey: "test-resend-key",
      verificationTokenTtlHours: 24,
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "test-mailing-secret",
    }, logger, fetcher as unknown as typeof fetch);

    await service.sendEmailVerificationEmail({
      to: "reader@ondraft.test",
      verificationUrl: "https://ondraftfootball.com/verify-email?token=example",
    });

    expect(fetcher).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-resend-key",
      }),
    }));

    const request = fetcher.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body).toMatchObject({
      from: "OnDraft <no-reply@ondraftfootball.com>",
      to: "reader@ondraft.test",
      subject: "Verify your OnDraft email",
    });
    expect(body.html).toContain("Verify your OnDraft email");
    expect(body.html).toContain("OnDraft Football");
    expect(body.html).toContain("https://ondraftfootball.com/images/brand/OnDraftLogo-cropped.png");
    expect(body.html).toContain("#d99822");
    expect(body.html).toContain("font-family:Segoe UI,Inter,Arial,sans-serif");
    expect(body.html).toContain("font-family:Georgia,Cambria,Times New Roman,serif");
    expect(body.html).toContain("https://ondraftfootball.com/verify-email?token=example");
    expect(body.text).toContain("https://ondraftfootball.com/verify-email?token=example");
  });

  it("sends a branded password reset email through Resend", async () => {
    const { logger } = testLogger();
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const service = CreateEmailService({
      provider: "resend",
      from: "OnDraft <no-reply@ondraftfootball.com>",
      appBaseUrl: "https://ondraftfootball.com",
      resendApiKey: "test-resend-key",
      verificationTokenTtlHours: 24,
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "test-mailing-secret",
    }, logger, fetcher as unknown as typeof fetch);

    await service.sendPasswordResetEmail({
      to: "reader@ondraft.test",
      resetUrl: "https://ondraftfootball.com/reset-password?token=example",
    });

    const request = fetcher.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body).toMatchObject({
      from: "OnDraft <no-reply@ondraftfootball.com>",
      to: "reader@ondraft.test",
      subject: "Reset your OnDraft password",
    });
    expect(body.html).toContain("Reset your password");
    expect(body.html).toContain("OnDraft Football");
    expect(body.html).toContain("https://ondraftfootball.com/images/brand/OnDraftLogo-cropped.png");
    expect(body.html).toContain("#d99822");
    expect(body.html).toContain("https://ondraftfootball.com/reset-password?token=example");
    expect(body.text).toContain("https://ondraftfootball.com/reset-password?token=example");
  });

  it("sends newsletters from the no-reply OnDraft address through Resend", async () => {
    const { logger } = testLogger();
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const service = CreateEmailService({
      provider: "resend",
      from: "OnDraft Support <support@ondraftfootball.com>",
      appBaseUrl: "https://ondraftfootball.com",
      resendApiKey: "test-resend-key",
      verificationTokenTtlHours: 24,
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "test-mailing-secret",
    }, logger, fetcher as unknown as typeof fetch);

    await service.sendNewsletterEmail({
      to: "reader@ondraft.test",
      subject: "OnDraft Newsletter - June 6, 2026",
      dateLabel: "June 6, 2026",
      writeup: "This week on OnDraft.",
      changelog: "New admin newsletter workflow.",
      articles: [],
      videos: [],
      unsubscribeUrl: "https://ondraftfootball.com/unsubscribe?token=example",
      logoUrl: "https://ondraftfootball.com/images/brand/OnDraftLogo-cropped.png",
    });

    const request = fetcher.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body).toMatchObject({
      from: "OnDraft <no-reply@ondraftfootball.com>",
      to: "reader@ondraft.test",
      subject: "OnDraft Newsletter - June 6, 2026",
    });
    expect(body.html).toContain("This week on OnDraft.");
    expect(body.text).toContain("New admin newsletter workflow.");
  });
});
