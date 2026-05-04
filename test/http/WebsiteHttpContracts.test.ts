import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { createComposedApp } from "../../src/composition";

function app() {
  return createComposedApp("memory").getExpressApp();
}

async function adminAgent() {
  const agent = request.agent(app());
  await agent
    .post("/login")
    .type("form")
    .send({ email: "alice@website.test", password: "password123" });
  return agent;
}

function removeUploadedPdfFromHtml(html: string) {
  const match = html.match(/\/uploads\/articles\/([^"]+\.pdf)/);
  if (!match) {
    return;
  }

  fs.rmSync(path.join(process.cwd(), "public", "uploads", "articles", decodeURIComponent(match[1])), {
    force: true,
  });
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

  it("keeps plain text article creation working", async () => {
    const agent = await adminAgent();

    const create = await agent
      .post("/articles")
      .type("form")
      .send({
        title: "Plain Text Film Room",
        author: "Alice Website",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "A regular article body.",
      });

    expect(create.status).toBe(302);
    expect(create.headers.location).toBe("/articles/Plain%20Text%20Film%20Room");

    const article = await agent.get(create.headers.location);

    expect(article.status).toBe(200);
    expect(article.text).toContain("A regular article body.");
  });

  it("renders uploaded PDF articles with an embedded viewer", async () => {
    const agent = await adminAgent();
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

    const create = await agent
      .post("/articles")
      .field("title", "PDF Film Room")
      .field("author", "Alice Website")
      .field("publicationDate", "2024-01-01")
      .field("contentType", "pdf")
      .attach("pdf", pdf, { filename: "film-room.pdf", contentType: "application/pdf" });

    expect(create.status).toBe(302);

    const article = await agent.get(create.headers.location);

    expect(article.status).toBe(200);
    expect(article.text).toContain("article-pdf-viewer");
    expect(article.text).toContain('type="application/pdf"');
    expect(article.text).toContain("/uploads/articles/");

    removeUploadedPdfFromHtml(article.text);
  });

  it("rejects non-PDF article uploads", async () => {
    const agent = await adminAgent();

    const create = await agent
      .post("/articles")
      .field("title", "Bad Upload")
      .field("author", "Alice Website")
      .field("publicationDate", "2024-01-01")
      .field("contentType", "pdf")
      .attach("pdf", Buffer.from("not a pdf"), { filename: "notes.txt", contentType: "text/plain" });

    expect(create.status).toBe(400);
    expect(create.text).toContain("Only PDF files can be uploaded");
  });

  it("rejects PDF articles without an uploaded file", async () => {
    const agent = await adminAgent();

    const create = await agent
      .post("/articles")
      .field("title", "Missing PDF")
      .field("author", "Alice Website")
      .field("publicationDate", "2024-01-01")
      .field("contentType", "pdf");

    expect(create.status).toBe(400);
    expect(create.text).toContain("A valid PDF article upload is required");
  });

  it("rejects oversized PDF article uploads", async () => {
    const agent = await adminAgent();
    const oversizedPdf = Buffer.alloc(5 * 1024 * 1024 + 1, "%PDF-1.4\n");

    const create = await agent
      .post("/articles")
      .field("title", "Large Upload")
      .field("author", "Alice Website")
      .field("publicationDate", "2024-01-01")
      .field("contentType", "pdf")
      .attach("pdf", oversizedPdf, { filename: "large.pdf", contentType: "application/pdf" });

    expect(create.status).toBe(400);
    expect(create.text).toContain("PDF uploads must be 5 MB or smaller");
  });
});
