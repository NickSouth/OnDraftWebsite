import { loadAppConfig } from "../../src/config/AppConfig";

describe("loadAppConfig", () => {
  it("defaults to safe logging email in development and test", () => {
    const config = loadAppConfig({
      NODE_ENV: "test",
      PORT: "3001",
      REPO_MODE: "memory",
    });

    expect(config.port).toBe(3001);
    expect(config.repositoryMode).toBe("memory");
    expect(config.email.provider).toBe("logging");
    expect(config.email.appBaseUrl).toBe("http://localhost:3000");
    expect(config.email.verificationTokenTtlHours).toBe(24);
    expect(config.email.passwordResetTokenTtlMinutes).toBe(60);
    expect(config.turnstile.siteKey).toBeNull();
    expect(config.turnstile.secretKey).toBeNull();
    expect(config.turnstile.verificationDisabled).toBe(false);
  });

  it("requires resend settings when the resend provider is selected", () => {
    expect(() =>
      loadAppConfig({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
      }),
    ).toThrow(/EMAIL_FROM is required/);
  });

  it("rejects logging email in production", () => {
    expect(() =>
      loadAppConfig({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "logging",
      }),
    ).toThrow(/EMAIL_PROVIDER=logging is not allowed in production/);
  });

  it("requires a session secret in production", () => {
    expect(() =>
      loadAppConfig({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: "support@ondraftfootball.com",
        RESEND_API_KEY: "re_test",
        APP_BASE_URL: "https://ondraftfootball.com",
      }),
    ).toThrow(/SESSION_SECRET is required/);
  });

  it("requires Turnstile keys in production", () => {
    expect(() =>
      loadAppConfig({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: "support@ondraftfootball.com",
        RESEND_API_KEY: "re_test",
        APP_BASE_URL: "https://ondraftfootball.com",
        SESSION_SECRET: "test-session-secret",
      }),
    ).toThrow(/TURNSTILE_SITE_KEY is required/);
  });

  it("requires Turnstile site and secret keys to be configured together", () => {
    expect(() =>
      loadAppConfig({
        NODE_ENV: "test",
        TURNSTILE_SITE_KEY: "site-key",
      }),
    ).toThrow(/TURNSTILE_SECRET_KEY is required/);
  });

  it("allows configuring the email verification token lifetime", () => {
    const config = loadAppConfig({
      NODE_ENV: "test",
      EMAIL_VERIFICATION_TOKEN_TTL_HOURS: "6",
      PASSWORD_RESET_TOKEN_TTL_MINUTES: "30",
      TURNSTILE_SITE_KEY: "site-key",
      TURNSTILE_SECRET_KEY: "secret-key",
    });

    expect(config.email.verificationTokenTtlHours).toBe(6);
    expect(config.email.passwordResetTokenTtlMinutes).toBe(30);
    expect(config.turnstile.siteKey).toBe("site-key");
    expect(config.turnstile.secretKey).toBe("secret-key");
    expect(config.turnstile.verificationDisabled).toBe(false);
  });

  it("allows disabling Turnstile verification outside production", () => {
    const config = loadAppConfig({
      NODE_ENV: "development",
      TURNSTILE_SITE_KEY: "site-key",
      TURNSTILE_SECRET_KEY: "secret-key",
      TURNSTILE_VERIFICATION_DISABLED: "true",
    });

    expect(config.turnstile.siteKey).toBe("site-key");
    expect(config.turnstile.secretKey).toBe("secret-key");
    expect(config.turnstile.verificationDisabled).toBe(true);
  });

  it("rejects disabling Turnstile verification in production", () => {
    expect(() =>
      loadAppConfig({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: "support@ondraftfootball.com",
        RESEND_API_KEY: "re_test",
        APP_BASE_URL: "https://ondraftfootball.com",
        SESSION_SECRET: "test-session-secret",
        TURNSTILE_SITE_KEY: "site-key",
        TURNSTILE_SECRET_KEY: "secret-key",
        TURNSTILE_VERIFICATION_DISABLED: "true",
      }),
    ).toThrow(/TURNSTILE_VERIFICATION_DISABLED cannot be true in production/);
  });
});
