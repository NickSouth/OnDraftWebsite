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

async function loginAdminAgent(ondraft: ReturnType<typeof app>) {
  const agent = request.agent(ondraft);
  await agent
    .post("/login")
    .type("form")
    .send({ email: "ryan@ondraftfootball.com", password: "password123" });
  return agent;
}

describe("default big board year over HTTP", () => {
  it("rejects non-admin default-year changes", async () => {
    const response = await request(app())
      .post("/bigboard/default-year")
      .type("form")
      .send({ year: "2030", creator: "Ryan" });

    expect(response.status).toBe(403);
  });

  it("admin sets the default year and the public board honors it", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const setDefault = await agent
      .post("/bigboard/default-year")
      .type("form")
      .send({ year: "2030", creator: "Ryan" });
    expect([200, 302]).toContain(setDefault.status);

    const board = await request(ondraft).get("/bigboard");
    expect(board.status).toBe(200);
    expect(board.text).toContain("2030 Ryan Big Board");
  });

  it("explicit ?year= still overrides the stored default", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    await agent
      .post("/bigboard/default-year")
      .type("form")
      .send({ year: "2030", creator: "Ryan" });

    const board = await request(ondraft).get("/bigboard?year=2026");
    expect(board.status).toBe(200);
    expect(board.text).toContain("2026 Ryan Big Board");
    expect(board.text).not.toContain("2030 Ryan Big Board");
  });

  it("htmx requests receive the bare default-year control fragment", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const response = await agent
      .post("/bigboard/default-year")
      .set("HX-Request", "true")
      .type("form")
      .send({ year: "2030", creator: "Ryan" });

    expect(response.status).toBe(200);
    expect(response.text).toContain('id="big-board-default-year-control"');
    expect(response.text).toContain("Default year");
    expect(response.text).not.toContain("<html");
  });

  it("editor shows the set-default button before and the default chip after setting", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const before = await agent.get("/bigboard/edit?year=2030&creator=Ryan");
    expect(before.status).toBe(200);
    expect(before.text).toContain("Set 2030 as default");

    const setDefault = await agent
      .post("/bigboard/default-year")
      .type("form")
      .send({ year: "2030", creator: "Ryan" });
    expect([200, 302]).toContain(setDefault.status);

    const after = await agent.get("/bigboard/edit?year=2030&creator=Ryan");
    expect(after.status).toBe(200);
    expect(after.text).toContain("Default year");
    expect(after.text).not.toContain("Set 2030 as default");
  });
});
