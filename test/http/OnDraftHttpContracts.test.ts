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
    .send({ email: "ryan@ondraftfootball.com", password: "password123" });
  return agent;
}

async function loginAdminAgent(ondraft: ReturnType<typeof app>) {
  const agent = request.agent(ondraft);
  await agent
    .post("/login")
    .type("form")
    .send({ email: "ryan@ondraftfootball.com", password: "password123" });
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

describe("OnDraft HTTP contracts", () => {
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
      .send({ email: "ryan@ondraftfootball.com", password: "password123" });

    expect(login.status).toBe(302);
    expect(login.headers.location).toBe("/");

    const ondraft = await agent.get("/");

    expect(ondraft.status).toBe(200);
    expect(ondraft.text).toContain("OnDraft");
    expect(ondraft.text).toContain("Ryan McWalter");
  });

  it("registers a new user and signs them in", async () => {
    const agent = request.agent(app());

    const register = await agent
      .post("/register")
      .type("form")
      .send({
        displayName: "New Analyst",
        email: "analyst@ondraft.test",
        password: "password123",
      });

    expect(register.status).toBe(302);
    expect(register.headers.location).toBe("/");

    const ondraft = await agent.get("/");

    expect(ondraft.status).toBe(200);
    expect(ondraft.text).toContain("New Analyst");
    expect(ondraft.text).toContain("Resend verification email");
  });

  it("accepts verification resend requests without revealing whether the email exists", async () => {
    const response = await request(app())
      .post("/verify-email/resend")
      .type("form")
      .send({ email: "unknown@ondraft.test" });

    expect(response.status).toBe(200);
    expect(response.text).toContain("If that email needs verification");
  });

  it("rate limits verification resend requests by email", async () => {
    const ondraft = app();
    let response = await request(ondraft)
      .post("/verify-email/resend")
      .type("form")
      .send({ email: "limited@ondraft.test" });

    for (let count = 0; count < 3; count += 1) {
      response = await request(ondraft)
        .post("/verify-email/resend")
        .type("form")
        .send({ email: "limited@ondraft.test" });
    }

    expect(response.status).toBe(429);
    expect(response.text).toContain("If that email needs verification");
  });

  it("rate limits verification resend requests by IP", async () => {
    const ondraft = app();
    let response = await request(ondraft)
      .post("/verify-email/resend")
      .type("form")
      .send({ email: "limited-0@ondraft.test" });

    for (let count = 1; count <= 6; count += 1) {
      response = await request(ondraft)
        .post("/verify-email/resend")
        .type("form")
        .send({ email: `limited-${count}@ondraft.test` });
    }

    expect(response.status).toBe(429);
    expect(response.text).toContain("If that email needs verification");
  });

  it("renders a safe mailing list unsubscribe failure page for invalid tokens", async () => {
    const response = await request(app()).get("/mailing-list/unsubscribe?token=invalid-token");

    expect(response.status).toBe(400);
    expect(response.text).toContain("We could not process that unsubscribe link.");
  });

  it("restricts mailing list subscriber CSV export to admins", async () => {
    const ondraft = app();

    const anonymous = await request(ondraft).get("/admin/mailing-list/subscribers.csv");
    expect(anonymous.status).toBe(403);

    const admin = await loginAdminAgent(ondraft);
    const exportResponse = await admin.get("/admin/mailing-list/subscribers.csv");

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    expect(exportResponse.headers["content-disposition"]).toContain("ondraft-mailing-list-subscribers.csv");
    expect(exportResponse.text).toContain('"email","status","consentSource","consentTextVersion"');
  });

  it("lets admins manage users with verification and mailing list status", async () => {
    const ondraft = app();

    const anonymous = await request(ondraft).get("/admin/users");
    expect(anonymous.status).toBe(403);

    const admin = await loginAdminAgent(ondraft);
    const usersPage = await admin.get("/admin/users");

    expect(usersPage.status).toBe(200);
    expect(usersPage.text).toContain("Manage Users");
    expect(usersPage.text).toContain("support@ondraftfootball.com");
    expect(usersPage.text).toContain("ryan@ondraftfootball.com");
    expect(usersPage.text).toContain("aleks@ondraftfootball.com");
    expect(usersPage.text).toContain("Download mailing list CSV");
  });

  it("allows anonymous visitors to view articles and the big board", async () => {
    const ondraft = app();

    const articles = await request(ondraft).get("/articles");
    const bigBoard = await request(ondraft).get("/bigboard");
    const hotTakes = await request(ondraft).get("/hottakes");

    expect(articles.status).toBe(200);
    expect(articles.text).toContain("Articles");
    expect(bigBoard.status).toBe(200);
    expect(bigBoard.text).toContain("Big Board");
    expect(hotTakes.status).toBe(200);
    expect(hotTakes.text).toContain("Hot Takes");
    expect(hotTakes.text).toContain("Log in");
  });

  it("lets admins edit board rows and publish player info separately from writeups", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const emptyBoard = await agent.get("/bigboard");
    expect(emptyBoard.status).toBe(200);
    expect(emptyBoard.text).toContain("Edit board");
    expect(emptyBoard.text).not.toContain("Create entry");

    const editor = await agent.get("/bigboard/edit?year=2026&creator=Ryan");
    expect(editor.status).toBe(200);
    expect(editor.text).toContain("Edit Big Board");
    expect(editor.text).toContain("Add player");
    expect(editor.text).toContain("Publish");

    const draft = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "entry-1",
        "entries[0][playerName]": "Hidden Prospect",
        "entries[0][school]": "OnDraft State",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "220",
        "entries[0][strengths]": "Pocket movement",
        "entries[0][weaknesses]": "Pressure answers",
        "entries[0][rundown]": "Starter traits.",
        "entries[0][notes]": "Private eval note.",
      });

    expect(draft.status).toBe(200);
    expect(draft.text).toContain("Saved.");

    const hiddenPublicBoard = await request(ondraft).get("/bigboard?year=2026&creator=Ryan");
    expect(hiddenPublicBoard.status).toBe(200);
    expect(hiddenPublicBoard.text).not.toContain("Hidden Prospect");

    const publishInfo = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "entry-1",
        "entries[0][playerName]": "Hidden Prospect",
        "entries[0][school]": "OnDraft State",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "220",
        "entries[0][strengths]": "Pocket movement",
        "entries[0][weaknesses]": "Pressure answers",
        "entries[0][rundown]": "Starter traits.",
        "entries[0][notes]": "Private eval note.",
        "entries[0][playerInfoPublished]": "true",
      });

    expect(publishInfo.status).toBe(200);
    expect(publishInfo.text).toContain("Saved.");

    const visibleWithoutWriteup = await agent.get("/bigboard?year=2026&creator=Ryan");
    expect(visibleWithoutWriteup.status).toBe(200);
    expect(visibleWithoutWriteup.text).toContain("Hidden Prospect");
    expect(visibleWithoutWriteup.text).not.toContain("Starter traits.");
    expect(visibleWithoutWriteup.text).not.toContain("Private eval note.");

    const publishWriteup = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "entry-1",
        "entries[0][playerName]": "Hidden Prospect",
        "entries[0][school]": "OnDraft State",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "220",
        "entries[0][strengths]": "Pocket movement",
        "entries[0][weaknesses]": "Pressure answers",
        "entries[0][rundown]": "Starter traits.",
        "entries[0][notes]": "Private eval note.",
        "entries[0][playerInfoPublished]": "true",
        "entries[0][writeupPublished]": "true",
      });

    expect(publishWriteup.status).toBe(200);
    expect(publishWriteup.text).toContain("Saved.");

    const visibleWithWriteup = await agent.get("/bigboard?year=2026&creator=Ryan");
    expect(visibleWithWriteup.status).toBe(200);
    expect(visibleWithWriteup.text).toContain("Starter traits.");
    expect(visibleWithWriteup.text).toContain("Pocket movement");
    expect(visibleWithWriteup.text).not.toContain("Private eval note.");
  });

  it("renders big board position and school filters and applies them through htmx", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const save = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "entry-qb",
        "entries[0][playerName]": "Quarterback Prospect",
        "entries[0][school]": "OnDraft State",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "220",
        "entries[0][playerInfoPublished]": "true",
        "entries[1][id]": "entry-wr",
        "entries[1][playerName]": "Receiver Prospect",
        "entries[1][school]": "Mock Tech",
        "entries[1][position]": "WR",
        "entries[1][rank]": "2",
        "entries[1][posRank]": "1",
        "entries[1][heightLabel]": "6-1",
        "entries[1][weight]": "205",
        "entries[1][playerInfoPublished]": "true",
      });

    expect(save.status).toBe(200);

    const fullBoard = await request(ondraft).get("/bigboard?year=2026&creator=Ryan");
    expect(fullBoard.status).toBe(200);
    expect(fullBoard.text).toContain('<select name="position">');
    expect(fullBoard.text).toContain('<option value="" selected>All</option>');
    expect(fullBoard.text).toContain('<option value="QB"');
    expect(fullBoard.text).toContain('<option value="OnDraft State"');
    expect(fullBoard.text).toContain('<option value="Mock Tech"');
    expect(fullBoard.text).toContain("Apply filters");
    expect(fullBoard.text).not.toContain("Reset");
    expect(fullBoard.text).toMatch(/>\s*Ryan\s*<\/button>/);
    expect(fullBoard.text).toMatch(/>\s*Aleks\s*<\/button>/);
    expect(fullBoard.text).toMatch(/>\s*Consensus\s*<\/button>/);

    const filteredBoard = await request(ondraft)
      .get("/bigboard?year=2026&creator=Ryan&position=QB&school=OnDraft%20State")
      .set("HX-Request", "true");

    expect(filteredBoard.status).toBe(200);
    expect(filteredBoard.text).toContain('hx-swap-oob="true"');
    expect(filteredBoard.text).toContain("Quarterback Prospect");
    expect(filteredBoard.text).not.toContain("Receiver Prospect");
    expect(filteredBoard.text).toContain('<option value="QB" selected>QB</option>');
    expect(filteredBoard.text).toContain('<option value="OnDraft State" selected>OnDraft State</option>');
    expect(filteredBoard.text).toContain("Reset");
    expect(filteredBoard.text).toContain('hx-get="/bigboard?year=2026&creator=Ryan"');

    const resetBoard = await request(ondraft)
      .get("/bigboard?year=2026&creator=Ryan")
      .set("HX-Request", "true");

    expect(resetBoard.status).toBe(200);
    expect(resetBoard.text).toContain("Quarterback Prospect");
    expect(resetBoard.text).toContain("Receiver Prospect");
    expect(resetBoard.text).not.toContain("Reset");
  });

  it("renders the consensus big board with averaged published rankings and discrepancy badges", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const saveRyan = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "ryan-qb",
        "entries[0][playerName]": "Quarterback Prospect",
        "entries[0][school]": "Ryan State",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "220",
        "entries[0][playerInfoPublished]": "true",
        "entries[1][id]": "ryan-edge",
        "entries[1][playerName]": "Edge Prospect",
        "entries[1][school]": "OnDraft State",
        "entries[1][position]": "EDGE",
        "entries[1][rank]": "4",
        "entries[1][posRank]": "1",
        "entries[1][heightLabel]": "6-4",
        "entries[1][weight]": "255",
        "entries[1][playerInfoPublished]": "true",
        "entries[2][id]": "ryan-tackle",
        "entries[2][playerName]": "Tackle Prospect",
        "entries[2][school]": "Published U",
        "entries[2][position]": "OT",
        "entries[2][rank]": "10",
        "entries[2][posRank]": "2",
        "entries[2][heightLabel]": "6-6",
        "entries[2][weight]": "315",
        "entries[2][playerInfoPublished]": "true",
      });
    expect(saveRyan.status).toBe(200);

    const saveAleks = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Aleks",
        "entries[0][id]": "aleks-qb",
        "entries[0][playerName]": "Quarterback Prospect",
        "entries[0][school]": "Aleks Tech",
        "entries[0][position]": "WR",
        "entries[0][rank]": "13",
        "entries[0][posRank]": "3",
        "entries[0][heightLabel]": "5-11",
        "entries[0][weight]": "185",
        "entries[0][playerInfoPublished]": "true",
        "entries[1][id]": "aleks-edge",
        "entries[1][playerName]": "Edge Prospect",
        "entries[1][school]": "OnDraft State",
        "entries[1][position]": "EDGE",
        "entries[1][rank]": "6",
        "entries[1][posRank]": "2",
        "entries[1][heightLabel]": "6-4",
        "entries[1][weight]": "255",
        "entries[1][playerInfoPublished]": "true",
        "entries[2][id]": "aleks-tackle",
        "entries[2][playerName]": "Tackle Prospect",
        "entries[2][school]": "Private U",
        "entries[2][position]": "IOL",
        "entries[2][rank]": "30",
        "entries[2][posRank]": "8",
        "entries[2][heightLabel]": "6-3",
        "entries[2][weight]": "295",
      });
    expect(saveAleks.status).toBe(200);

    const consensus = await agent.get("/bigboard?year=2026&creator=Consensus");

    expect(consensus.status).toBe(200);
    expect(consensus.text).toContain('value="Consensus"');
    expect(consensus.text).toMatch(/aria-pressed="true"[\s\S]*Consensus/);
    expect(consensus.text).not.toContain("/bigboard/edit?year=2026&amp;creator=Consensus");
    expect(consensus.text).toMatch(/5\. Edge Prospect[\s\S]*EDGE1\.5/);
    expect(consensus.text).toMatch(/7\. Quarterback Prospect[\s\S]*QB2/);
    expect(consensus.text).toContain("Ryan State");
    expect(consensus.text).not.toContain("Aleks Tech");
    expect(consensus.text).toContain("Big discrepancy");
    expect(consensus.text).toMatch(/10\. Tackle Prospect[\s\S]*Published U/);
    expect(consensus.text).not.toContain("Private U");
  });

  it("lets admins create a new big board year from the editor", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const editor = await agent.get("/bigboard/edit");
    expect(editor.status).toBe(200);
    expect(editor.text).toContain("Create draft class");

    const createYear = await agent
      .post("/bigboard/years")
      .type("form")
      .send({ year: "2027", creator: "Aleks" });

    expect(createYear.status).toBe(302);
    expect(createYear.headers.location).toBe("/bigboard/edit?year=2027&creator=Aleks");

    const newYearEditor = await agent.get(createYear.headers.location);
    expect(newYearEditor.status).toBe(200);
    expect(newYearEditor.text).toContain("2027 Aleks");
    expect(newYearEditor.text).toContain('<option value="2027" selected>2027</option>');
    expect(newYearEditor.text).toContain("Are you sure? This will delete all boards from that year");
  });

  it("lets admins delete a big board year from the editor", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    await agent
      .post("/bigboard/years")
      .type("form")
      .send({ year: "2027", creator: "Ryan" });

    const deleteYear = await agent
      .post("/bigboard/years/delete")
      .type("form")
      .send({ year: "2027", creator: "Ryan" });

    expect(deleteYear.status).toBe(302);
    expect(deleteYear.headers.location).toBe("/bigboard/edit?year=2026&creator=Ryan");

    const editor = await agent.get(deleteYear.headers.location);
    expect(editor.status).toBe(200);
    expect(editor.text).not.toContain('<option value="2027"');
  });

  it("supports hot take posting, filtering, liking, commenting, and owner deletion", async () => {
    const agent = await adminAgent();

    const create = await agent
      .post("/hottakes")
      .type("form")
      .set("HX-Request", "true")
      .send({ content: "Never draft a round-one long snapper." });

    expect(create.status).toBe(200);
    expect(create.text).toContain("Never draft a round-one long snapper.");
    expect(create.text).toContain("hx-swap-oob");

    const postId = create.text.match(/id="hot-take-([A-Za-z0-9]{5})"/)?.[1];
    expect(postId).toBeTruthy();

    const filtered = await agent.get("/hottakes/filter?keyword=long%20snapper&sortBy=likes");
    expect(filtered.status).toBe(200);
    expect(filtered.text).toContain("Never draft a round-one long snapper.");

    const like = await agent
      .post(`/hottakes/${postId}/like`)
      .set("HX-Request", "true");
    expect(like.status).toBe(200);
    expect(like.text).toContain(">1<");

    const comment = await agent
      .post(`/hottakes/${postId}/comments`)
      .type("form")
      .set("HX-Request", "true")
      .send({ text: "Counterpoint: special teams matter." });
    expect(comment.status).toBe(200);
    expect(comment.text).toContain("Counterpoint: special teams matter.");

    const remove = await agent
      .delete(`/hottakes/${postId}`)
      .set("HX-Request", "true");
    expect(remove.status).toBe(200);
  });

  it("lets signed-in users bookmark articles and hot takes from htmx pin buttons", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const home = await agent.get("/");
    expect(home.status).toBe(200);
    expect(home.text).toContain('href="/bookmarks"');

    const createArticle = await agent
      .post("/articles")
      .type("form")
      .send({
        title: "Bookmarkable Article",
        author: "Ryan McWalter",
        writeup: "A short bookmark summary.",
        tags: "draft",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "A regular article body.",
      });
    expect(createArticle.status).toBe(302);
    const articleId = createArticle.headers.location.match(/\/articles\/([A-Za-z0-9]{5})/)?.[1];
    expect(articleId).toBeTruthy();

    const articles = await agent.get("/articles");
    expect(articles.status).toBe(200);
    expect(articles.text).toContain(`hx-post="/articles/${articleId}/bookmark"`);
    expect(articles.text).toContain("Bookmarkable Article");

    const bookmarkArticle = await agent
      .post(`/articles/${articleId}/bookmark`)
      .set("HX-Request", "true");
    expect(bookmarkArticle.status).toBe(200);
    expect(bookmarkArticle.text).toContain("is-bookmarked");
    expect(bookmarkArticle.text).toContain("Remove article bookmark");

    const createHotTake = await agent
      .post("/hottakes")
      .type("form")
      .set("HX-Request", "true")
      .send({ content: "Bookmark this hot take." });
    expect(createHotTake.status).toBe(200);
    const postId = createHotTake.text.match(/id="hot-take-([A-Za-z0-9]{5})"/)?.[1];
    expect(postId).toBeTruthy();
    expect(createHotTake.text).toContain(`hx-post="/hottakes/${postId}/bookmark"`);

    const bookmarkHotTake = await agent
      .post(`/hottakes/${postId}/bookmark`)
      .set("HX-Request", "true");
    expect(bookmarkHotTake.status).toBe(200);
    expect(bookmarkHotTake.text).toContain("is-bookmarked");
    expect(bookmarkHotTake.text).toContain("Remove forum post bookmark");

    const bookmarks = await agent.get("/bookmarks");
    expect(bookmarks.status).toBe(200);
    expect(bookmarks.text).toContain("Bookmarkable Article");
    expect(bookmarks.text).toContain(`/articles/${articleId}`);
    expect(bookmarks.text).toContain("Bookmark this hot take.");
    expect(bookmarks.text).toContain(`/hottakes#hot-take-${postId}`);

    const removeArticleBookmark = await agent
      .post(`/articles/${articleId}/bookmark`)
      .set("HX-Request", "true");
    expect(removeArticleBookmark.status).toBe(200);
    expect(removeArticleBookmark.text).not.toContain("is-bookmarked");

    const updatedBookmarks = await agent.get("/bookmarks");
    expect(updatedBookmarks.status).toBe(200);
    expect(updatedBookmarks.text).not.toContain("Bookmarkable Article");
    expect(updatedBookmarks.text).toContain("Bookmark this hot take.");
  });

  it("lets admins create YouTube videos and renders the public videos page with filters", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const home = await request(ondraft).get("/");
    expect(home.status).toBe(200);
    expect(home.text).toContain('href="/videos"');

    const form = await agent.get("/videos/new");
    expect(form.status).toBe(200);
    expect(form.text).toContain("Add YouTube Video");

    const invalid = await agent
      .post("/videos")
      .type("form")
      .send({
        youtubeUrl: "https://example.com/not-youtube",
        title: "Bad Link",
        description: "This should not save.",
        tags: "draft",
      });
    expect(invalid.status).toBe(400);
    expect(invalid.text).toContain("Enter a valid YouTube video URL");

    const first = await agent
      .post("/videos")
      .type("form")
      .send({
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Quarterback Film",
        description: "A look at quarterback processing.",
        tags: "film-room,qb",
      });
    expect(first.status).toBe(302);
    expect(first.headers.location).toBe("/videos");

    const second = await agent
      .post("/videos")
      .type("form")
      .send({
        youtubeUrl: "https://youtu.be/oHg5SJYRHA0",
        title: "Receiver Notes",
        description: "A look at receiver releases.",
        tags: "film-room,wr",
      });
    expect(second.status).toBe(302);

    const videos = await request(ondraft).get("/videos");
    expect(videos.status).toBe(200);
    expect(videos.text).toContain("Quarterback Film");
    expect(videos.text).toContain("Receiver Notes");
    expect(videos.text).toContain("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(videos.text).toContain("Views unavailable");
    expect(videos.text).not.toContain("YOUTUBE_API_KEY");

    const filtered = await request(ondraft).get("/videos?keyword=quarterback&tags=film-room&sortBy=date&sortDirection=asc");
    expect(filtered.status).toBe(200);
    expect(filtered.text).toContain("Quarterback Film");
    expect(filtered.text).not.toContain("Receiver Notes");
    expect(filtered.text).toContain('value="quarterback"');
    expect(filtered.text).toContain('value="film-room"');
    expect(filtered.text).toContain('<option value="asc" selected>Ascending</option>');
  });

  it("keeps plain text article creation working", async () => {
    const agent = await adminAgent();

    const create = await agent
      .post("/articles")
      .type("form")
      .send({
        title: "Plain Text Film Room",
        author: "Ryan McWalter",
        writeup: "A short plain text summary.",
        tags: "draft,film-room",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "A regular article body.",
      });

    expect(create.status).toBe(302);
    expect(create.headers.location).toMatch(/^\/articles\/[A-Za-z0-9]{5}$/);

    const article = await agent.get(create.headers.location);

    expect(article.status).toBe(200);
    expect(article.text).toContain("A regular article body.");
    expect(article.text).toContain('class="icon-button article-share-button"');
    expect(article.text).toContain('data-share-url="/articles/');
    expect(article.text).toContain("Share");

    const articles = await agent.get("/articles");

    expect(articles.status).toBe(200);
    expect(articles.text).toContain("A short plain text summary.");
    expect(articles.text).toContain("draft");
    expect(articles.text).toContain("film-room");
  });

  it("keeps plain text article content escaped", async () => {
    const agent = await adminAgent();

    const create = await agent
      .post("/articles")
      .type("form")
      .send({
        title: "Escaped Plain Text",
        author: "Ryan McWalter",
        writeup: "A short escaped summary.",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "<strong>Not html</strong>",
      });

    expect(create.status).toBe(302);

    const article = await agent.get(create.headers.location);

    expect(article.status).toBe(200);
    expect(article.text).toContain("&lt;strong&gt;Not html&lt;/strong&gt;");
    expect(article.text).not.toContain("<strong>Not html</strong>");
  });

  it("supports article likes and authenticated HTMX comments", async () => {
    const ondraft = app();
    const admin = await loginAdminAgent(ondraft);

    const create = await admin
      .post("/articles")
      .type("form")
      .send({
        title: "Interactive Film Room",
        author: "Ryan McWalter",
        writeup: "A short interactive summary.",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "A regular article body.",
      });

    expect(create.status).toBe(302);
    const articlePath = create.headers.location;
    const articleId = articlePath.split("/").pop();

    const anonymous = request.agent(ondraft);
    const like = await anonymous.post(`/articles/${articleId}/like`);
    expect(like.status).toBe(200);
    expect(like.text).toContain(">1</span>");
    expect(like.text).toContain(`data-share-url="/articles/${articleId}"`);

    const unlike = await anonymous.post(`/articles/${articleId}/like`);
    expect(unlike.status).toBe(200);
    expect(unlike.text).toContain(">0</span>");

    const likeAgain = await anonymous.post(`/articles/${articleId}/like`);
    expect(likeAgain.status).toBe(200);
    expect(likeAgain.text).toContain(">1</span>");

    const anonymousComment = await request(ondraft)
      .post(`/articles/${articleId}/comments`)
      .type("form")
      .send({ text: "Anonymous comment." });
    expect(anonymousComment.status).toBe(403);

    const reader = request.agent(ondraft);
    await reader
      .post("/register")
      .type("form")
      .send({
        displayName: "Reader One",
        email: "reader@ondraft.test",
        password: "password123",
      });

    const unverifiedComment = await reader
      .post(`/articles/${articleId}/comments`)
      .type("form")
      .send({ text: "Good read." });

    expect(unverifiedComment.status).toBe(403);
    expect(unverifiedComment.text).toContain("Verify your email to comment.");

    const comment = await admin
      .post(`/articles/${articleId}/comments`)
      .type("form")
      .send({ text: "Good read." });

    expect(comment.status).toBe(200);
    expect(comment.text).toContain("Good read.");
    expect(comment.text).toContain("Ryan McWalter");

    const commentId = comment.text.match(/id="comment-([A-Za-z0-9]{8})"/)?.[1];
    expect(commentId).toBeDefined();
    expect(comment.text).toContain(`/articles/${articleId}/comments/${commentId}/replies`);

    const reply = await admin
      .post(`/articles/${articleId}/comments/${commentId}/replies`)
      .type("form")
      .send({ text: "Agree with this." });

    expect(reply.status).toBe(200);
    expect(reply.text).toContain("Agree with this.");
    expect(reply.text).toContain("reply-list");

    const likedComment = await anonymous.post(`/comments/${commentId}/like`);
    expect(likedComment.status).toBe(200);
    expect(likedComment.text).toContain(">1</span>");

    const unlikedComment = await anonymous.post(`/comments/${commentId}/like`);
    expect(unlikedComment.status).toBe(200);
    expect(unlikedComment.text).toContain(">0</span>");

    await anonymous.post(`/comments/${commentId}/like`);

    const articles = await request(ondraft).get("/articles");
    expect(articles.status).toBe(200);
    expect(articles.text).toContain("1 likes");
    expect(articles.text).toContain("1 comments");

    const deleted = await admin.delete(`/articles/${articleId}/comments/${commentId}`);
    expect(deleted.status).toBe(200);
    expect(deleted.text).not.toContain("Good read.");
  });

  it("lets admins delete any comment and pages comments ten at a time", async () => {
    const ondraft = app();
    const admin = await loginAdminAgent(ondraft);

    const create = await admin
      .post("/articles")
      .type("form")
      .send({
        title: "Paged Comments",
        author: "Ryan McWalter",
        writeup: "A short comments summary.",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "A regular article body.",
      });

    const articleId = create.headers.location.split("/").pop();
    for (let index = 1; index <= 11; index += 1) {
      await admin
        .post(`/articles/${articleId}/comments`)
        .type("form")
        .send({ text: `Comment ${index}` });
    }

    const firstPage = await request(ondraft).get(`/articles/${articleId}/comments`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.text).toContain("Comment 10");
    expect(firstPage.text).not.toContain("Comment 11");
    expect(firstPage.text).toContain("Show More");

    const secondPage = await request(ondraft).get(`/articles/${articleId}/comments?limit=20`);
    expect(secondPage.status).toBe(200);
    expect(secondPage.text).toContain("Comment 11");

    const commentIds = [...secondPage.text.matchAll(/id="comment-([A-Za-z0-9]{8})"/g)].map((match) => match[1]);
    const commentId = commentIds.at(-1);
    expect(commentId).toBeDefined();

    const deletedByAdmin = await admin.delete(`/articles/${articleId}/comments/${commentId}`);
    expect(deletedByAdmin.status).toBe(200);
    expect(deletedByAdmin.text).not.toContain("Comment 11");
  });

  it("sorts filtered article results by date, likes, and comments", async () => {
    const ondraft = app();
    const admin = await loginAdminAgent(ondraft);

    const older = await admin
      .post("/articles")
      .type("form")
      .send({
        title: "Older Sort Article",
        author: "Ryan McWalter",
        writeup: "Older summary.",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "Older article body.",
      });
    const newer = await admin
      .post("/articles")
      .type("form")
      .send({
        title: "Newer Sort Article",
        author: "Ryan McWalter",
        writeup: "Newer summary.",
        publicationDate: "2024-02-01",
        contentType: "plainText",
        content: "Newer article body.",
      });

    const olderId = older.headers.location.split("/").pop();
    const newerId = newer.headers.location.split("/").pop();
    await request(ondraft).post(`/articles/${olderId}/like`);
    await admin
      .post(`/articles/${newerId}/comments`)
      .type("form")
      .send({ text: "Newer comment." });

    const articlesPage = await request(ondraft).get("/articles");
    expect(articlesPage.status).toBe(200);
    expect(articlesPage.text).toContain('name="sortBy"');
    expect(articlesPage.text).toContain('name="sortDirection"');
    expect(articlesPage.text).toContain("htmx.trigger(this.form, 'submit')");

    const dateAsc = await request(ondraft).get("/articles/filter?sortBy=date&sortDirection=asc");
    expect(dateAsc.text.indexOf("Older Sort Article")).toBeLessThan(dateAsc.text.indexOf("Newer Sort Article"));

    const likesDesc = await request(ondraft).get("/articles/filter?sortBy=likes&sortDirection=desc");
    expect(likesDesc.text.indexOf("Older Sort Article")).toBeLessThan(likesDesc.text.indexOf("Newer Sort Article"));

    const commentsDesc = await request(ondraft).get("/articles/filter?sortBy=comments&sortDirection=desc");
    expect(commentsDesc.text.indexOf("Newer Sort Article")).toBeLessThan(commentsDesc.text.indexOf("Older Sort Article"));
  });

  it("renders sanitized HTML article content unescaped", async () => {
    const agent = await adminAgent();

    const create = await agent
      .post("/articles")
      .type("form")
      .send({
        title: "HTML Film Room",
        author: "Ryan McWalter",
        writeup: "A short HTML summary.",
        publicationDate: "2024-01-01",
        contentType: "html",
        content: '<h2>Film Room</h2><p onclick="alert(1)">Safe copy</p><script>alert(1)</script><iframe src="https://example.com"></iframe>',
      });

    expect(create.status).toBe(302);

    const article = await agent.get(create.headers.location);

    expect(article.status).toBe(200);
    expect(article.text).toContain('<div class="article-body article-html-body"><h2>Film Room</h2><p>Safe copy</p></div>');
    expect(article.text).not.toContain("<script>alert");
    expect(article.text).not.toContain("onclick");
    expect(article.text).not.toContain("<iframe");
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

    const htmlFields = await agent.get("/articles/new/content-fields?contentType=html");
    expect(htmlFields.status).toBe(200);
    expect(htmlFields.text).toContain("HTML content");
    expect(htmlFields.text).toContain("<textarea");

    const plainTextFields = await agent.get("/articles/new/content-fields?contentType=plainText");
    expect(plainTextFields.status).toBe(200);
    expect(plainTextFields.text).toContain("<textarea");
    expect(plainTextFields.text).not.toContain('name="pdf"');
  });

  it("previews an article before publishing", async () => {
    const agent = await adminAgent();

    const preview = await agent
      .post("/articles/preview")
      .type("form")
      .send({
        title: "Preview Film Room",
        author: "Ryan McWalter",
        writeup: "A short preview summary.",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "Preview article body.",
      });

    expect(preview.status).toBe(200);
    expect(preview.text).toContain("Article Preview");
    expect(preview.text).toContain("Preview article body.");
    expect(preview.text).toMatch(/\/images\/article-defaults\/(?:football|helmet|uprights)\.png/);
    expect(preview.text).toContain('name="published" value="false"');
    expect(preview.text).toContain('name="published" value="true"');
  });

  it("lets admins save drafts and swap to the unpublished article list", async () => {
    const agent = await adminAgent();

    const create = await agent
      .post("/articles")
      .type("form")
      .send({
        title: "Draft Film Room",
        author: "Ryan McWalter",
        writeup: "A short draft summary.",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "Draft article body.",
        published: "false",
      });

    expect(create.status).toBe(302);
    expect(create.headers.location).toBe("/articles?status=draft");

    const publishedArticles = await agent.get("/articles/filter?status=published");
    const draftArticles = await agent.get("/articles/filter?status=draft");

    expect(publishedArticles.status).toBe(200);
    expect(publishedArticles.text).not.toContain("Draft Film Room");
    expect(draftArticles.status).toBe(200);
    expect(draftArticles.text).toContain("Draft Film Room");
    expect(draftArticles.text).toContain("Draft -");
  });

  it("links draft articles to preview and lets admins edit and publish them", async () => {
    const agent = await adminAgent();

    const create = await agent
      .post("/articles")
      .type("form")
      .send({
        title: "Editable Draft",
        author: "Ryan McWalter",
        writeup: "A draft before edits.",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "Draft body.",
        published: "false",
      });

    expect(create.status).toBe(302);
    const draftList = await agent.get("/articles/filter?status=draft");
    const articleId = draftList.text.match(/href="\/articles\/([A-Za-z0-9]{5})\/preview"/)?.[1];
    expect(articleId).toBeDefined();
    expect(draftList.text).toContain('hx-confirm="Are you sure? Deleted articles cannot be recovered."');

    const preview = await agent.get(`/articles/${articleId}/preview`);
    expect(preview.status).toBe(200);
    expect(preview.text).toContain(`href="/articles/${articleId}/edit"`);
    expect(preview.text).toContain(`action="/articles/${articleId}"`);

    const edit = await agent.get(`/articles/${articleId}/edit`);
    expect(edit.status).toBe(200);
    expect(edit.text).toContain("Edit Article");
    expect(edit.text).toContain('value="Editable Draft"');
    expect(edit.text).toContain("Draft body.");

    const update = await agent
      .post(`/articles/${articleId}`)
      .type("form")
      .send({
        title: "Published After Edit",
        author: "Ryan McWalter",
        writeup: "An edited summary.",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "Edited body.",
        published: "true",
      });

    expect(update.status).toBe(302);
    expect(update.headers.location).toBe(`/articles/${articleId}`);

    const article = await agent.get(`/articles/${articleId}`);
    expect(article.status).toBe(200);
    expect(article.text).toContain("Published After Edit");
    expect(article.text).toContain("Edited body.");
  });

  it("lets admins delete articles from the list", async () => {
    const agent = await adminAgent();

    const create = await agent
      .post("/articles")
      .type("form")
      .send({
        title: "Delete Me",
        author: "Ryan McWalter",
        writeup: "A short delete summary.",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "Article to delete.",
      });

    const articleId = create.headers.location.split("/").pop();
    const articles = await agent.get("/articles");
    expect(articles.text).toContain(`hx-delete="/articles/${articleId}"`);

    const deleted = await agent.delete(`/articles/${articleId}`);
    expect(deleted.status).toBe(200);

    const missing = await agent.get(`/articles/${articleId}`);
    expect(missing.status).toBe(404);
  });

  it("renders uploaded PDF articles as in-page article canvases", async () => {
    const agent = await adminAgent();
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

    const create = await agent
      .post("/articles")
      .field("title", "PDF Film Room")
      .field("author", "Ryan McWalter")
      .field("writeup", "A short PDF summary.")
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
      .field("author", "Ryan McWalter")
      .field("writeup", "A short image summary.")
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
      .field("author", "Ryan McWalter")
      .field("writeup", "A short bad upload summary.")
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
      .field("author", "Ryan McWalter")
      .field("writeup", "A short missing PDF summary.")
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
      .field("author", "Ryan McWalter")
      .field("writeup", "A short large upload summary.")
      .field("publicationDate", "2024-01-01")
      .field("contentType", "pdf")
      .attach("pdf", oversizedPdf, { filename: "large.pdf", contentType: "application/pdf" });

    expect(create.status).toBe(400);
    expect(create.text).toContain("PDF uploads must be 5 MB or smaller");
  });
});
