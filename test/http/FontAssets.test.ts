import request from "supertest";
import { createComposedApp } from "../../src/composition";

function testConfig() {
  return {
    port: 3000,
    repositoryMode: "memory" as const,
    email: {
      provider: "logging" as const,
      from: null,
      appBaseUrl: "http://localhost:3000",
      resendApiKey: null,
      verificationTokenTtlHours: 24,
      passwordResetTokenTtlMinutes: 60,
      mailingListUnsubscribeSecret: "test-mailing-secret",
    },
    turnstile: { siteKey: null as string | null, secretKey: null as string | null, verificationDisabled: false },
    analytics: {
      umamiWebsiteId: null,
      umamiApiKey: null,
      umamiApiBaseUrl: "https://api.umami.is/v1",
    },
  };
}

function app() {
  return createComposedApp("memory", undefined, testConfig()).getExpressApp();
}

describe("self-hosted font assets (v2.1 FE-2)", () => {
  it("serves the Newsreader 800 weight css from /vendor/fonts", async () => {
    const response = await request(app()).get("/vendor/fonts/newsreader/800.css");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/css");
    expect(response.text).toContain("font-display: swap");
    expect(response.text).toContain("Newsreader");
  });

  it("serves the Source Sans 3 400 weight css from /vendor/fonts", async () => {
    const response = await request(app()).get("/vendor/fonts/source-sans-3/400.css");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/css");
    expect(response.text).toContain("Source Sans 3");
  });

  it("serves the preloaded Newsreader woff2 file", async () => {
    const response = await request(app()).get("/vendor/fonts/newsreader/files/newsreader-latin-800-normal.woff2");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("font/woff2");
  });

  it("references the self-hosted fonts (and no Google Fonts) in a full page render", async () => {
    const response = await request(app()).get("/about");

    expect(response.status).toBe(200);
    expect(response.text).toContain("/vendor/fonts/newsreader/800.css");
    expect(response.text).toContain("/vendor/fonts/source-sans-3/400.css");
    expect(response.text).toMatch(/<link rel="preload" href="\/vendor\/fonts\/[^"]+\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
    expect(response.text).not.toContain("fonts.googleapis.com");
    expect(response.text).not.toContain("fonts.gstatic.com");
  });
});
