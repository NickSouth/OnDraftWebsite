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

function removeUploadedAssetsFromHtml(html: string) {
  const matches = html.matchAll(/\/uploads\/articles\/([^"#]+?\.(?:pdf|jpg|jpeg|png|gif|webp))/g);
  for (const match of matches) {
    fs.rmSync(path.join(process.cwd(), "public", "uploads", "articles", decodeURIComponent(match[1])), {
      force: true,
    });
  }
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

  it("swaps article content fields with the HTMX partial route", async () => {
    const agent = await adminAgent();

    const createForm = await agent.get("/articles/new");
    expect(createForm.status).toBe(200);
    expect(createForm.text).toContain('hx-get="/articles/new/content-fields"');
    expect(createForm.text).toContain('id="article-content-fields"');

    const pdfFields = await agent.get("/articles/new/content-fields?contentType=pdf");
    expect(pdfFields.status).toBe(200);
    expect(pdfFields.text).toContain('type="file" name="pdf"');
    expect(pdfFields.text).not.toContain("<textarea");

    const plainTextFields = await agent.get("/articles/new/content-fields?contentType=plainText");
    expect(plainTextFields.status).toBe(200);
    expect(plainTextFields.text).toContain("<textarea");
    expect(plainTextFields.text).not.toContain('name="pdf"');
  });

  it("renders uploaded PDF articles as in-page article canvases", async () => {
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
    expect(article.text).toContain("article-pdf-document");
    expect(article.text).toContain("data-pdf-url=");
    expect(article.text).toContain("/articlePdf.js");
    expect(article.text).not.toContain("<iframe");
    expect(article.text).toContain("/uploads/articles/");

    removeUploadedAssetsFromHtml(article.text);
  });

  it("renders uploaded article images", async () => {
    const agent = await adminAgent();
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
    ]);

    const create = await agent
      .post("/articles")
      .field("title", "Image Film Room")
      .field("author", "Alice Website")
      .field("publicationDate", "2024-01-01")
      .field("contentType", "plainText")
      .field("content", "Article with an uploaded image.")
      .attach("image", png, { filename: "cover.png", contentType: "image/png" });

    expect(create.status).toBe(302);

    const article = await agent.get(create.headers.location);

    expect(article.status).toBe(200);
    expect(article.text).toContain('class="article-cover-thumb"');
    expect(article.text).toContain("/uploads/articles/");

    const articles = await agent.get("/articles");

    expect(articles.status).toBe(200);
    expect(articles.text).toContain('class="article-list-thumb"');
    expect(articles.text).toContain("Image Film Room");

    removeUploadedAssetsFromHtml(article.text + articles.text);
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
