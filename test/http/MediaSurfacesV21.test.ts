import request from "supertest";
import { createComposedApp } from "../../src/composition";

function testConfig(turnstile = { siteKey: null as string | null, secretKey: null as string | null, verificationDisabled: false }) {
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
    turnstile,
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

async function adminAgent() {
  const agent = request.agent(app());
  await agent
    .post("/login")
    .type("form")
    .send({ email: "ryan@ondraftfootball.com", password: "password123" });
  return agent;
}

function generatedWords(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
}

describe("v2.1 media surfaces (FE-9 video play overlay + FS-6 article read time)", () => {
  it("videos grid shows a play overlay on every thumbnail", async () => {
    const res = await request(app()).get("/videos");
    expect(res.status).toBe(200);
    expect((res.text.match(/od-video-play-overlay/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("home carousel overlays video slides and shows article read times", async () => {
    const res = await request(app()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("od-video-play-overlay");
    expect(res.text).toContain("min read");
  });

  it("articles page shows read times and no play overlays", async () => {
    const res = await request(app()).get("/articles");
    expect(res.status).toBe(200);
    expect(res.text).toContain("min read");
    expect(res.text).not.toContain("od-video-play-overlay");
  });

  it("article detail shows the computed read time", async () => {
    const agent = await adminAgent();
    const createArticle = await agent
      .post("/articles")
      .type("form")
      .send({
        title: "Read Time Article",
        author: "Ryan McWalter",
        writeup: "A short summary for the read time article.",
        tags: "draft",
        publicationDate: "2026-01-01",
        contentType: "plainText",
        content: generatedWords(250),
        published: "true",
      });
    expect(createArticle.status).toBe(302);
    const articleId = createArticle.headers.location.match(/\/articles\/([A-Za-z0-9]{5})/)?.[1];
    expect(articleId).toBeTruthy();

    const detail = await agent.get(`/articles/${articleId}`);
    expect(detail.status).toBe(200);
    expect(detail.text).toContain("2 min read");
  });

  it("htmx article list fragment carries read time", async () => {
    const res = await request(app())
      .get("/articles/filter?viewMode=list")
      .set("HX-Request", "true");
    expect(res.status).toBe(200);
    expect(res.text).toContain("min read");
  });

  it("bookmarked articles show read time", async () => {
    const agent = await adminAgent();
    const createArticle = await agent
      .post("/articles")
      .type("form")
      .send({
        title: "Bookmarked Read Time Article",
        author: "Ryan McWalter",
        writeup: "A short summary for the bookmarked article.",
        tags: "draft",
        publicationDate: "2026-01-01",
        contentType: "plainText",
        content: generatedWords(250),
        published: "true",
      });
    expect(createArticle.status).toBe(302);
    const articleId = createArticle.headers.location.match(/\/articles\/([A-Za-z0-9]{5})/)?.[1];
    expect(articleId).toBeTruthy();

    const bookmark = await agent
      .post(`/articles/${articleId}/bookmark`)
      .set("HX-Request", "true");
    expect(bookmark.status).toBe(200);

    const bookmarks = await agent.get("/bookmarks");
    expect(bookmarks.status).toBe(200);
    expect(bookmarks.text).toContain("Bookmarked Read Time Article");
    expect(bookmarks.text).toContain("min read");
  });
});
