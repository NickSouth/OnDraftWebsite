import request from "supertest";
import { createComposedApp } from "../../src/composition";

function app() {
  return createComposedApp("memory").getExpressApp();
}

describe("Website HTTP contracts", () => {
  it("redirects anonymous visitors to login", async () => {
    const response = await request(app()).get("/");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/login");
  });

  it("logs in a demo user and renders the website shell", async () => {
    const agent = request.agent(app());

    const login = await agent
      .post("/login")
      .type("form")
      .send({ email: "alice@website.test", password: "password123" });

    expect(login.status).toBe(302);
    expect(login.headers.location).toBe("/website");

    const website = await agent.get("/website");

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
    expect(register.headers.location).toBe("/website");

    const website = await agent.get("/website");

    expect(website.status).toBe(200);
    expect(website.text).toContain("New Analyst");
  });
});
