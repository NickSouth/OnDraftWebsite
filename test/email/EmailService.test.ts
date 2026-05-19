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
  it("logs verification URLs in safe logging mode", async () => {
    const { logger, messages } = testLogger();
    const service = CreateEmailService({
      provider: "logging",
      from: null,
      appBaseUrl: null,
      resendApiKey: null,
    }, logger);

    await service.sendEmailVerificationEmail({
      to: "reader@ondraft.test",
      verificationUrl: "https://ondraftfootball.com/verify-email?token=example",
    });

    expect(messages).toContain(
      "Email verification URL for reader@ondraft.test: https://ondraftfootball.com/verify-email?token=example",
    );
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
    expect(body.html).toContain("https://ondraftfootball.com/verify-email?token=example");
    expect(body.text).toContain("https://ondraftfootball.com/verify-email?token=example");
  });
});
