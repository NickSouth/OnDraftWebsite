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
});
