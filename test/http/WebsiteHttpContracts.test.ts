import request from "supertest";
import { createComposedApp } from "../../src/composition";

function app() {
  return createComposedApp("memory").getExpressApp();
}

describe("Website HTTP contracts", () => {
  it("renders the home page for anonymous visitors", async () => {
    const response = await request(app()).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("View articles");
    expect(response.text).toContain("Log in");
  });

  it("logs in a demo user and renders the home page", async () => {
    const agent = request.agent(app());

    const login = await agent
      .post("/login")
      .type("form")
      .send({ email: "alice@website.test", password: "password123" });

    expect(login.status).toBe(302);
    expect(login.headers.location).toBe("/");

    const website = await agent.get("/");

    expect(website.status).toBe(200);
    expect(website.text).toContain("Website Shell");
    expect(website.text).toContain("Alice Website");
  });

  it("registers a new user and signs them in", async () => {
    const agent = request.agent(app());

    const register = await agent
      .post("/register")
      .type("form")
      .send({
        displayName: "New Analyst",
        email: "analyst@website.test",
        password: "password123",
      });

    expect(register.status).toBe(302);
    expect(register.headers.location).toBe("/");

    const website = await agent.get("/");

    expect(website.status).toBe(200);
    expect(website.text).toContain("New Analyst");
  });

  it("allows anonymous visitors to view articles and the big board", async () => {
    const website = app();

    const articles = await request(website).get("/articles");
    const bigBoard = await request(website).get("/bigboard");

    expect(articles.status).toBe(200);
    expect(articles.text).toContain("Articles");
    expect(bigBoard.status).toBe(200);
    expect(bigBoard.text).toContain("Big Board");
  });
});
