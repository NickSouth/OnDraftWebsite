import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

// The upload folders are fixed when the upload modules load, so the volume has to be configured
// before the app is required. Jest gives each test file its own module registry, which keeps
// this from leaking into the other suites.
const volume = fs.mkdtempSync(path.join(os.tmpdir(), "ondraft-upload-volume-"));
const previousUploadDataDir = process.env.UPLOAD_DATA_DIR;
process.env.UPLOAD_DATA_DIR = volume;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createComposedApp } = require("../../src/composition") as typeof import("../../src/composition");

function app() {
  return createComposedApp("memory", undefined, {
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
    turnstile: { siteKey: null, secretKey: null, verificationDisabled: false },
  }).getExpressApp();
}

async function adminAgent() {
  const agent = request.agent(app());
  await agent.post("/login").type("form").send({ email: "ryan@ondraftfootball.com", password: "password123" });
  return agent;
}

function filesUnder(directory: string): string[] {
  return fs.existsSync(directory) ? fs.readdirSync(directory) : [];
}

describe("uploads on a persistent volume", () => {
  afterAll(() => {
    if (previousUploadDataDir === undefined) {
      delete process.env.UPLOAD_DATA_DIR;
    } else {
      process.env.UPLOAD_DATA_DIR = previousUploadDataDir;
    }
    fs.rmSync(volume, { recursive: true, force: true });
  });

  it("stores an article thumbnail on the volume and still serves it from /uploads/articles", async () => {
    const agent = await adminAgent();
    const thumbnail = Buffer.from("thumbnail bytes kept on the volume");

    const create = await agent
      .post("/articles")
      .field("title", "Volume Thumbnail Film Room")
      .field("author", "Ryan McWalter")
      .field("writeup", "A short summary.")
      .field("publicationDate", "2024-01-01")
      .field("contentType", "plainText")
      .field("content", "Body.")
      .field("published", "true")
      .attach("image", thumbnail, { filename: "volume-thumb.png", contentType: "image/png" });
    expect(create.status).toBe(302);

    const article = await agent.get(create.headers.location);
    const imageUrl = article.text.match(/class="article-list-thumb" src="(\/uploads\/articles\/[^"]+)"/)?.[1];
    expect(imageUrl).toBeDefined();
    const filename = decodeURIComponent(path.posix.basename(imageUrl as string));

    // The file is on the volume and nowhere under the app's own public folder.
    expect(fs.readFileSync(path.join(volume, "uploads", "articles", filename))).toEqual(thumbnail);
    expect(fs.existsSync(path.join(process.cwd(), "public", "uploads", "articles", filename))).toBe(false);

    // A fresh app instance, as after a redeploy, serves the same file from the same URL.
    const served = await request(app()).get(imageUrl as string);
    expect(served.status).toBe(200);
    expect(served.body).toEqual(thumbnail);
  });

  it("serves an uploaded PDF from the volume inline", async () => {
    const agent = await adminAgent();
    const pdf = Buffer.from("%PDF-1.4\n% kept on the volume\n");

    const create = await agent
      .post("/articles")
      .field("title", "Volume PDF Film Room")
      .field("author", "Ryan McWalter")
      .field("writeup", "A short summary.")
      .field("publicationDate", "2024-01-01")
      .field("contentType", "pdf")
      .field("published", "true")
      .attach("pdf", pdf, { filename: "volume.pdf", contentType: "application/pdf" });
    expect(create.status).toBe(302);

    const article = await agent.get(create.headers.location);
    const pdfUrl = article.text.match(/data-pdf-url="(\/uploads\/articles\/[^"]+\.pdf)"/)?.[1];
    expect(pdfUrl).toBeDefined();

    const served = await request(app()).get(pdfUrl as string);
    expect(served.status).toBe(200);
    expect(served.headers["content-disposition"]).toBe("inline");
    expect(filesUnder(path.join(volume, "uploads", "articles"))).toContain(decodeURIComponent(path.posix.basename(pdfUrl as string)));
  });

  it("stores HTML article images and videos on the volume and serves them from their generated URLs", async () => {
    const agent = await adminAgent();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const mp4 = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(64, 0x21)]);

    const image = await agent
      .post("/articles/html-images")
      .attach("htmlImage", png, { filename: "Volume Image.png", contentType: "image/png" });
    expect(image.status).toBe(200);
    const video = await agent
      .post("/articles/html-videos")
      .attach("htmlVideo", mp4, { filename: "Volume Reel.mp4", contentType: "video/mp4" });
    expect(video.status).toBe(200);

    expect(filesUnder(path.join(volume, "generated", "article-images", "v1"))).toEqual([path.posix.basename(image.body.url)]);
    expect(filesUnder(path.join(volume, "generated", "article-videos", "v1"))).toEqual([path.posix.basename(video.body.url)]);
    // The finished video was moved out of the scratch folder, which sits on the same volume.
    expect(filesUnder(path.join(volume, "tmp", "article-video-uploads"))).toEqual([]);

    const freshApp = app();
    expect((await request(freshApp).get(image.body.url)).status).toBe(200);
    const servedVideo = await request(freshApp).get(video.body.url);
    expect(servedVideo.status).toBe(200);
    expect(servedVideo.body).toEqual(mp4);
  });
});
