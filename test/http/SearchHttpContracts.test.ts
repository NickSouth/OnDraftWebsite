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

async function loginAdminAgent(ondraft: ReturnType<typeof app>) {
  const agent = request.agent(ondraft);
  await agent
    .post("/login")
    .type("form")
    .send({ email: "ryan@ondraftfootball.com", password: "password123" });
  return agent;
}

describe("Search HTTP contracts (v2.1 c8-search)", () => {
  it("renders the full search page with grouped results", async () => {
    const response = await request(app()).get("/search?q=quarterback");

    expect(response.status).toBe(200);
    expect(response.text).toContain("<html");
    expect(response.text).toContain("Five quarterback traits that keep showing up on third-and-medium");
    expect(response.text).toContain("Quarterback room check-in: what still translates on Sundays");
    expect(response.text).toContain("Quarterback rankings should start with pressure answers");
    expect(response.text).toContain("Articles On Tap (1)");
    expect(response.text).toContain("Bar TV (1)");
    expect(response.text).toContain("Taproom Hot Takes (1)");
  });

  it("renders the results fragment for htmx requests", async () => {
    const response = await request(app())
      .get("/search?q=quarterback")
      .set("HX-Request", "true");

    expect(response.status).toBe(200);
    expect(response.text).not.toContain("<html");
    expect(response.text).toContain("Five quarterback traits that keep showing up on third-and-medium");
  });

  it("prompts when the query is missing or too short", async () => {
    const ondraft = app();

    const missing = await request(ondraft).get("/search");
    expect(missing.status).toBe(200);
    expect(missing.text).toContain("Type at least 2 characters");

    const tooShort = await request(ondraft).get("/search?q=a");
    expect(tooShort.status).toBe(200);
    expect(tooShort.text).toContain("Type at least 2 characters");
  });

  it("shows the empty state when nothing matches", async () => {
    const response = await request(app()).get("/search?q=zzqxzz");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Dry tap");
  });

  it("escapes the echoed query", async () => {
    const response = await request(app())
      .get("/search")
      .query({ q: "<script>alert(1)</script>" });

    expect(response.status).toBe(200);
    expect(response.text).not.toContain("<script>alert");
  });

  it("finds only published big-board players", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const saved = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "entry-search-1",
        "entries[0][playerName]": "Searchable Quarterback Prospect",
        "entries[0][school]": "Alabama",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2.375",
        "entries[0][weight]": "220",
        "entries[0][strengths]": "Pocket movement",
        "entries[0][weaknesses]": "Pressure answers",
        "entries[0][rundown]": "Starter traits.",
        "entries[0][notes]": "Private eval note.",
        "entries[0][playerInfoPublished]": "true",
        "entries[1][id]": "entry-search-2",
        "entries[1][playerName]": "Unsearchable Secret Prospect",
        "entries[1][school]": "Georgia",
        "entries[1][position]": "QB",
        "entries[1][rank]": "2",
        "entries[1][posRank]": "2",
        "entries[1][heightLabel]": "6-1",
        "entries[1][weight]": "210",
        "entries[1][strengths]": "Arm talent",
        "entries[1][weaknesses]": "Timing",
        "entries[1][rundown]": "Developmental.",
        "entries[1][notes]": "Private eval note.",
      });
    expect(saved.status).toBe(200);

    const response = await request(ondraft).get("/search?q=searchable");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Draft Board Prospects");
    expect(response.text).toContain("Searchable Quarterback Prospect");
    expect(response.text).toContain("/bigboard?year=2026");
    expect(response.text).not.toContain("Unsearchable Secret Prospect");
  });

  it("live suggest returns a compact fragment", async () => {
    const ondraft = app();

    const suggest = await request(ondraft)
      .get("/search/suggest?q=quarterback")
      .set("HX-Request", "true");
    expect(suggest.status).toBe(200);
    expect(suggest.text).toContain("od-search-suggest-panel");
    expect(suggest.text).toContain("View all results");

    const tooShort = await request(ondraft)
      .get("/search/suggest?q=a")
      .set("HX-Request", "true");
    expect(tooShort.status).toBe(200);
    expect(tooShort.text.trim()).toBe("");
  });

  it("rate limits repeated search requests", async () => {
    const ondraft = app();

    for (let index = 0; index < 120; index += 1) {
      const attempt = await request(ondraft)
        .get("/search?q=beer")
        .set("HX-Request", "true");
      expect(attempt.status).not.toBe(429);
    }

    const limited = await request(ondraft)
      .get("/search?q=beer")
      .set("HX-Request", "true");

    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeTruthy();
  });
});
