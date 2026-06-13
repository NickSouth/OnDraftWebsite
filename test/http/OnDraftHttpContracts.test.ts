import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { createComposedApp } from "../../src/composition";
import type { IEmailService, SendEmailVerificationEmailInput, SendNewsletterEmailInput, SendPasswordResetEmailInput } from "../../src/email/EmailService";

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

class CapturingEmailService implements IEmailService {
  verificationEmails: SendEmailVerificationEmailInput[] = [];
  passwordResetEmails: SendPasswordResetEmailInput[] = [];
  newsletterEmails: SendNewsletterEmailInput[] = [];

  async sendEmailVerificationEmail(input: SendEmailVerificationEmailInput): Promise<void> {
    this.verificationEmails.push(input);
  }

  async sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
    this.passwordResetEmails.push(input);
  }

  async sendNewsletterEmail(input: SendNewsletterEmailInput): Promise<void> {
    this.newsletterEmails.push(input);
  }
}

function app() {
  return createComposedApp("memory", undefined, testConfig()).getExpressApp();
}

function appWithEmailCapture() {
  const emailService = new CapturingEmailService();
  const ondraft = createComposedApp("memory", undefined, testConfig(), { emailService }).getExpressApp();
  return { ondraft, emailService };
}

function appWithTurnstile() {
  return createComposedApp("memory", undefined, testConfig({
      siteKey: "test-site-key",
      secretKey: "test-secret-key",
      verificationDisabled: false,
  })).getExpressApp();
}

function appWithDisabledTurnstile() {
  return createComposedApp("memory", undefined, testConfig({
      siteKey: "test-site-key",
      secretKey: "test-secret-key",
      verificationDisabled: true,
  })).getExpressApp();
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

function edgeGradePayload(prefix: string, score = "6", potential = "6") {
  const physicalTraits = ["Speed", "Acceleration", "Agility", "Change of Direction", "Strength", "Size / Frame"];
  const filmTraits = ["Get Off", "Bend", "Power", "Finesse", "Pass Rush Plan", "Block Shed", "Pad Level", "Anchor", "Discipline & Diagnostics", "Tackling", "Pursuit", "Coverage"];
  const payload: Record<string, string> = {
    [`${prefix}[grade][position]`]: "EDGE",
    [`${prefix}[grade][archetype]`]: "Balanced",
    [`${prefix}[grade][potential]`]: potential,
  };
  physicalTraits.forEach((trait) => {
    payload[`${prefix}[grade][physicalTraits][${trait}]`] = score;
  });
  filmTraits.forEach((trait) => {
    payload[`${prefix}[grade][filmTraits][${trait}]`] = score;
  });
  return payload;
}

function removeUploadedAssetsFromHtml(html: string) {
  const matches = html.matchAll(/\/uploads\/articles\/([^"#]+?\.(?:pdf|jpg|jpeg|png|gif|webp))/g);
  for (const match of matches) {
    fs.rmSync(path.join(process.cwd(), "public", "uploads", "articles", decodeURIComponent(match[1])), {
      force: true,
    });
  }
}

function removeGeneratedArticleImagesFromHtml(html: string) {
  const matches = html.matchAll(/\/generated\/article-images\/v1\/([^"#]+?\.(?:jpg|png|gif|webp))/g);
  for (const match of matches) {
    fs.rmSync(path.join(process.cwd(), "public", "generated", "article-images", "v1", decodeURIComponent(match[1])), {
      force: true,
    });
  }
}

describe("OnDraft HTTP contracts", () => {
  it("renders the home page for anonymous visitors", async () => {
    const response = await request(app()).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers["content-security-policy"]).toContain("https://i.ytimg.com");
    expect(response.headers["content-security-policy"]).toContain("https://gateway.umami.is");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.text).toContain('<meta name="robots" content="index, follow, max-image-preview:large"');
    expect(response.text).toContain('<link rel="manifest" href="/site.webmanifest"');
    expect(response.text).toContain('<script type="application/ld+json">');
    expect(response.text).toContain('"@type":"WebSite"');
    expect(response.text).toContain("Articles On Tap");
    expect(response.text).toContain("Log in");
    expect(response.text).toContain('href="/about"');
    expect(response.text).not.toContain('hx-get="/about"');
    expect(response.text).toContain('hx-target="#site-modal-outlet"');
    expect(response.text).toContain("/images/brand/OnDraftLogo-cropped.png");
    expect(response.text).toContain('<meta property="og:image" content="http://localhost:3000/images/brand/OnDraftLogo-cropped.png"');
    expect(response.text).toContain('<meta name="twitter:image" content="http://localhost:3000/images/brand/OnDraftLogo-cropped.png"');
    expect(response.text).toContain("/images/social/youtube-icon.svg");
    expect(response.text).toContain("/images/social/x-icon.svg");
    expect(response.text).toContain("/images/social/tiktok-icon.svg");
    expect(response.text).toContain("https://www.venmo.com/u/OnDraft-Football");
    expect(response.text).toContain('id="site-loader"');
    expect(response.text).toContain('aria-label="Loading page" hidden');
    expect(response.text).toContain('class="w-full od-page-stage is-ready"');
    expect(response.text).toContain('id="loading-skeleton-templates"');
    expect(response.text).toContain('data-page-skeleton="articles"');
    expect(response.text).toContain('data-result-skeleton="article-results-card"');
    expect(response.text).toContain('data-result-skeleton="article-results-list"');
    expect(response.text).toContain("od-loading-card");
    expect(response.text).not.toContain("[PLACEHOLDER FOR SOCIAL MEDIA LINKS]");
  });

  it("enables spellcheck for editable text fields from the shell script", async () => {
    const response = await request(app()).get("/ondraftShell.js");

    expect(response.status).toBe(200);
    expect(response.text).toContain("spellcheckSelector");
    expect(response.text).toContain('field.setAttribute("spellcheck", "true")');
    expect(response.text).toContain("MutationObserver");
    expect(response.text).toContain("htmx:afterSettle");
    expect(response.text).toContain("showRouteSkeleton");
    expect(response.text).toContain("showResultSkeleton");
    expect(response.text).toContain("resolvedResultSkeletonName");
    expect(response.text).toContain("data-loading-skeleton");
  });

  it("generates cacheable helmet assets for validated color pairs", async () => {
    const generatedPath = path.join(process.cwd(), "public", "generated", "helmets", "v1", "690014-f1f2f3.png");
    await fs.promises.rm(generatedPath, { force: true });

    const response = await request(app()).get("/generated/helmets/v1/690014-f1f2f3.png");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(response.body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(fs.existsSync(generatedPath)).toBe(true);

    await fs.promises.rm(generatedPath, { force: true });
  });

  it("rejects generated helmet paths outside the color-key boundary", async () => {
    const response = await request(app()).get("/generated/helmets/v1/not-a-key.png");

    expect(response.status).toBe(404);
  });

  it("stores HTML article images under predictable cacheable generated URLs", async () => {
    const agent = await adminAgent();
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
    ]);

    const upload = await agent
      .post("/articles/html-images")
      .attach("htmlImage", png, { filename: "Pocket Passer.png", contentType: "image/png" });

    expect(upload.status).toBe(200);
    expect(upload.body.url).toMatch(/^\/generated\/article-images\/v1\/[0-9a-f]{16}-pocket-passer\.png$/);

    const secondUpload = await agent
      .post("/articles/html-images")
      .attach("htmlImage", png, { filename: "Pocket Passer.png", contentType: "image/png" });

    expect(secondUpload.status).toBe(200);
    expect(secondUpload.body.url).toBe(upload.body.url);

    const image = await request(app()).get(upload.body.url);
    expect(image.status).toBe(200);
    expect(image.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(image.headers["content-type"]).toContain("image/png");

    removeGeneratedArticleImagesFromHtml(upload.body.url);
  });

  it("blocks cross-origin state-changing requests when an origin is present", async () => {
    const response = await request(app())
      .post("/login")
      .set("Origin", "https://evil.example")
      .type("form")
      .send({ email: "ryan@ondraftfootball.com", password: "password123" });

    expect(response.status).toBe(403);
    expect(response.text).toContain("Request blocked.");
  });

  it("blocks production state-changing requests when origin and referrer are missing", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSessionSecret = process.env.SESSION_SECRET;
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "test-production-session-secret";

    try {
      const response = await request(app())
        .post("/login")
        .type("form")
        .send({ email: "ryan@ondraftfootball.com", password: "password123" });

      expect(response.status).toBe(403);
      expect(response.text).toContain("Request blocked.");
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      if (originalSessionSecret === undefined) {
        delete process.env.SESSION_SECRET;
      } else {
        process.env.SESSION_SECRET = originalSessionSecret;
      }
    }
  });

  it("rate limits repeated login attempts", async () => {
    const ondraft = app();

    for (let index = 0; index < 20; index += 1) {
      const attempt = await request(ondraft)
        .post("/login")
        .type("form")
        .send({ email: "rate-limit@ondraft.test", password: "" });
      expect(attempt.status).toBe(400);
    }

    const limited = await request(ondraft)
      .post("/login")
      .type("form")
      .send({ email: "rate-limit@ondraft.test", password: "" });

    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeTruthy();
    expect(limited.text).toContain("Too many requests.");
  });

  it("keeps token-bearing pages out of caches", async () => {
    const response = await request(app()).get("/reset-password?token=test-token");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store, private");
  });

  it("renders Turnstile only on high-risk auth forms when configured", async () => {
    const ondraft = appWithTurnstile();

    const login = await request(ondraft).get("/login");
    const register = await request(ondraft).get("/register");
    const forgotPassword = await request(ondraft).get("/forgot-password");
    const home = await request(ondraft).get("/");

    expect(login.text).toContain('class="cf-turnstile"');
    expect(register.text).toContain('class="cf-turnstile"');
    expect(forgotPassword.text).toContain('class="cf-turnstile"');
    expect(login.text).toContain('data-sitekey="test-site-key"');
    expect(home.text).not.toContain("cf-turnstile");
  });

  it("rejects protected auth forms when Turnstile token is missing", async () => {
    const response = await request(appWithTurnstile())
      .post("/login")
      .type("form")
      .send({ email: "ryan@ondraftfootball.com", password: "password123" });

    expect(response.status).toBe(400);
    expect(response.text).toContain("We could not verify this request. Please try again.");
    expect(response.text).toContain("Account Login");
    expect(response.text).toContain("<!doctype html>");
  });

  it("skips Turnstile widgets and verification when locally disabled", async () => {
    const ondraft = appWithDisabledTurnstile();
    const login = await request(ondraft).get("/login");

    expect(login.status).toBe(200);
    expect(login.text).not.toContain("cf-turnstile");

    const response = await request(ondraft)
      .post("/login")
      .type("form")
      .send({ email: "ryan@ondraftfootball.com", password: "password123" });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/");
  });

  it("verifies Turnstile server-side before accepting protected auth forms", async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const response = await request(appWithTurnstile())
        .post("/login")
        .type("form")
        .send({
          email: "ryan@ondraftfootball.com",
          password: "password123",
          "cf-turnstile-response": "valid-turnstile-token",
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe("/");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        expect.objectContaining({
          method: "POST",
        }),
      );
      const [, options] = fetchMock.mock.calls[0];
      expect(String(options.body)).toContain("secret=test-secret-key");
      expect(String(options.body)).toContain("response=valid-turnstile-token");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("renders about and legal routes as full pages, with HTMX modal partials available", async () => {
    const about = await request(app()).get("/about");
    const privacy = await request(app()).get("/privacy");
    const contact = await request(app()).get("/contact");
    const terms = await request(app()).get("/terms");
    const privacyModal = await request(app()).get("/privacy").set("HX-Request", "true");

    expect(about.status).toBe(200);
    expect(about.text).toContain("<h1");
    expect(about.text).toContain("About Us");
    expect(about.text).toContain("Our Story");
    expect(about.text).toContain("Ryan McWalter");
    expect(about.text).toContain("Aleks Ryabinkin");
    expect(about.text).toContain("Nick Southey");
    expect(about.text).toContain("https://www.linkedin.com/in/ryan-mcwalter/");
    expect(about.text).toContain("https://www.linkedin.com/in/aleksandr-ryabinkin-96a589330/");
    expect(about.text).toContain("@Ryan McWalter");
    expect(about.text).toContain("/images/team/ryan-mcwalter.jpg");
    expect(about.text).toContain("mailto:ryan@ondraftfootball.com");
    expect(about.text).toContain("/files/ryan-mcwalter-resume.docx");
    expect(about.text).toContain("/ Resume");
    expect(about.text).toContain("https://x.com/rymcw3");
    expect(about.text).toContain("/images/social/x-icon.svg");
    expect(about.text).toContain("/ @rymcw3");
    expect(about.text).toContain("@Aleksandr Ryabinkin");
    expect(about.text).toContain("/images/social/linkedin-in-bug.png");
    expect(about.text).toContain("/images/team/nick-southey.jpg");
    expect(about.text).toContain("https://github.com/NickSouth");
    expect(about.text).toContain("/ @NickSouth");
    expect(about.text).toContain("/images/social/github-lockup.svg");
    expect(about.text).not.toContain('role="dialog"');

    expect(privacy.status).toBe(200);
    expect(privacy.text).toContain("<!doctype html>");
    expect(privacy.text).toContain("<h1");
    expect(privacy.text).toContain("OnDraft Football");
    expect(privacy.text).toContain("ondraftfootball.com");
    expect(privacy.text).toContain("support@ondraftfootball.com");
    expect(privacy.text).toContain("1. Information We Collect");
    expect(privacy.text).toContain("8. Social Media Affiliation and Icon Use");
    expect(privacy.text).toContain("15. Contact Us");

    expect(contact.status).toBe(200);
    expect(contact.text).toContain("<!doctype html>");
    expect(contact.text).toContain("For all business inquiries or suggestions");

    expect(terms.status).toBe(200);
    expect(terms.text).toContain("<!doctype html>");
    expect(terms.text).toContain("Terms and Community Guidelines");
    expect(terms.text).toContain("Community Guidelines");

    expect(privacyModal.status).toBe(200);
    expect(privacyModal.text).toContain('role="dialog"');
    expect(privacyModal.text).not.toContain("<!doctype html>");
  });

  it("serves crawler and feed discovery endpoints", async () => {
    const ondraft = app();
    const robots = await request(ondraft).get("/robots.txt");
    const sitemap = await request(ondraft).get("/sitemap.xml");
    const feed = await request(ondraft).get("/feed.xml");
    const manifest = await request(ondraft).get("/site.webmanifest");
    const security = await request(ondraft).get("/.well-known/security.txt");

    expect(robots.status).toBe(200);
    expect(robots.text).toContain("Sitemap:");
    expect(robots.text).toContain("Disallow: /login");
    expect(sitemap.status).toBe(200);
    expect(sitemap.text).toContain("<urlset");
    expect(sitemap.text).toContain("<loc>http://localhost:3000/terms</loc>");
    expect(sitemap.text).toContain("<loc>http://localhost:3000/articles/");
    expect(sitemap.text).toContain("<lastmod>");
    expect(feed.status).toBe(200);
    expect(feed.text).toContain("<rss");
    expect(feed.text).toContain("<channel>");
    expect(feed.text).toContain("<guid>");
    expect(manifest.status).toBe(200);
    expect(manifest.body.name).toBe("OnDraft Football");
    expect(manifest.body.icons[0].src).toBe("/images/brand/OnDraftLogo-favicon.png");
    expect(security.status).toBe(200);
    expect(security.text).toContain("Contact: mailto:support@ondraftfootball.com");
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
    expect(ondraft.text).toContain('hx-get="/settings"');
    expect(ondraft.text).toContain("Open account settings");
    expect(ondraft.text).toContain('rel="alternate" type="application/rss+xml"');
  });

  it("renders and updates account settings through modal routes", async () => {
    const ondraft = app();
    const anonymous = await request(ondraft).get("/settings");
    expect(anonymous.status).toBe(401);
    expect(anonymous.text).toContain("Log in to manage account settings.");

    const agent = await loginAdminAgent(ondraft);
    const modal = await agent.get("/settings");

    expect(modal.status).toBe(200);
    expect(modal.text).toContain('role="dialog"');
    expect(modal.text).toContain("Settings");
    expect(modal.text).toContain("Mailing list");
    expect(modal.text).toContain("Subscribe");
    expect(modal.text).toContain("Change password");
    expect(modal.text).toContain("Send reset link");
    expect(modal.text).toContain("Delete account");
    expect(modal.text).toContain("This cannot be undone.");
    expect(modal.text).toContain('action="/settings/delete-account"');

    const passwordReset = await agent.post("/settings/change-password");
    expect(passwordReset.status).toBe(200);
    expect(passwordReset.text).toContain("We sent a password reset link to your email.");

    const subscribed = await agent
      .post("/settings/mailing-list")
      .type("form")
      .send({ preference: "subscribe" });

    expect(subscribed.status).toBe(200);
    expect(subscribed.text).toContain("You are subscribed to the OnDraft mailing list.");
    expect(subscribed.text).toContain("Unsubscribe");

    const unsubscribed = await agent
      .post("/settings/mailing-list")
      .type("form")
      .send({ preference: "unsubscribe" });

    expect(unsubscribed.status).toBe(200);
    expect(unsubscribed.text).toContain("You are unsubscribed from the OnDraft mailing list.");
    expect(unsubscribed.text).toContain("Subscribe");
  });

  it("shows verification resend in settings only for unverified users", async () => {
    const agent = request.agent(app());

    await agent
      .post("/register")
      .type("form")
      .send({
        displayName: "Unverified Reader",
        email: "unverified-reader@ondraft.test",
        password: "password123",
        confirmPassword: "password123",
      });

    const modal = await agent.get("/settings");

    expect(modal.status).toBe(200);
    expect(modal.text).toContain("Email verification");
    expect(modal.text).toContain("Resend verify email");

    const resent = await agent.post("/settings/resend-verification");
    expect(resent.status).toBe(200);
    expect(resent.text).toContain("we sent a new verification link");
  });

  it("lets non-admin users delete their own account from settings", async () => {
    const ondraft = app();
    const agent = request.agent(ondraft);

    await agent
      .post("/register")
      .type("form")
      .send({
        displayName: "Delete Me",
        email: "delete-me@ondraft.test",
        password: "password123",
        confirmPassword: "password123",
      });

    const deleted = await agent.post("/settings/delete-account");
    expect(deleted.status).toBe(302);
    expect(deleted.headers.location).toBe("/");

    const home = await agent.get("/");
    expect(home.status).toBe(200);
    expect(home.text).toContain("Log in");
    expect(home.text).not.toContain("Delete Me");

    const login = await request(ondraft)
      .post("/login")
      .type("form")
      .send({ email: "delete-me@ondraft.test", password: "password123" });
    expect(login.status).toBe(401);
  });

  it("does not allow admin self-deletion from settings", async () => {
    const agent = await adminAgent();

    const deleted = await agent.post("/settings/delete-account");

    expect(deleted.status).toBe(200);
    expect(deleted.text).toContain("Admin accounts cannot be deleted from account settings.");
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
        confirmPassword: "password123",
      });

    expect(register.status).toBe(302);
    expect(register.headers.location).toBe("/");

    const ondraft = await agent.get("/");

    expect(ondraft.status).toBe(200);
    expect(ondraft.text).toContain("New Analyst");
    expect(ondraft.text).not.toContain("Resend verification email");
  });

  it("requires verified email before posting hot takes", async () => {
    const ondraft = app();
    const reader = request.agent(ondraft);
    await reader
      .post("/register")
      .type("form")
      .send({
        displayName: "Unverified Hot Take",
        email: "unverified-hot-take@ondraft.test",
        password: "password123",
        confirmPassword: "password123",
      });

    const page = await reader.get("/hottakes");
    expect(page.status).toBe(200);
    expect(page.text).toContain("Verify your email before posting a hot take.");
    expect(page.text).not.toContain("Post Hot Take");

    const create = await reader
      .post("/hottakes")
      .type("form")
      .set("HX-Request", "true")
      .send({ content: "This should be blocked." });

    expect(create.status).toBe(403);
    expect(create.text).toContain("Verify your email before posting a hot take.");
  });

  it("verifies an email token through the routed verification page", async () => {
    const { ondraft, emailService } = appWithEmailCapture();
    const agent = request.agent(ondraft);
    const register = await agent
      .post("/register")
      .type("form")
      .send({
        displayName: "Needs Verification",
        email: "needs-verification@ondraft.test",
        password: "password123",
        confirmPassword: "password123",
      });
    expect(register.status).toBe(302);
    expect(emailService.verificationEmails).toHaveLength(1);

    await agent
      .post("/login")
      .type("form")
      .send({ email: "needs-verification@ondraft.test", password: "password123" });

    const beforeSettings = await agent.get("/settings");
    expect(beforeSettings.status).toBe(200);
    expect(beforeSettings.text).toContain("Email verification");

    const rawToken = new URL(emailService.verificationEmails[0].verificationUrl).searchParams.get("token") ?? "";
    const verified = await agent.get(`/verify-email?token=${encodeURIComponent(rawToken)}`);

    expect(verified.status).toBe(200);
    expect(verified.text).toContain("Email Verified");
    expect(verified.text).toContain("Your email has been verified.");

    const afterSettings = await agent.get("/settings");
    expect(afterSettings.status).toBe(200);
    expect(afterSettings.text).not.toContain("Email verification");
    expect(afterSettings.text).not.toContain("Resend verify email");
  });

  it("requests and completes password reset through routed pages", async () => {
    const { ondraft, emailService } = appWithEmailCapture();
    const register = await request(ondraft)
      .post("/register")
      .type("form")
      .send({
        displayName: "Reset Reader",
        email: "reset-reader@ondraft.test",
        password: "password123",
        confirmPassword: "password123",
      });
    expect(register.status).toBe(302);

    const requestReset = await request(ondraft)
      .post("/forgot-password")
      .type("form")
      .send({ email: "reset-reader@ondraft.test" });
    expect(requestReset.status).toBe(200);
    expect(requestReset.text).toContain("If that email is registered, we sent a password reset link.");

    const unknownReset = await request(ondraft)
      .post("/forgot-password")
      .type("form")
      .send({ email: "unknown-reset@ondraft.test" });
    expect(unknownReset.status).toBe(400);
    expect(unknownReset.text).toContain("No OnDraft account exists for that email address.");

    expect(emailService.passwordResetEmails).toHaveLength(1);
    const rawToken = new URL(emailService.passwordResetEmails[0].resetUrl).searchParams.get("token") ?? "";

    const form = await request(ondraft).get(`/reset-password?token=${encodeURIComponent(rawToken)}`);
    expect(form.status).toBe(200);
    expect(form.text).toContain("Choose New Password");
    expect(form.text).toContain("Confirm new password");

    const mismatch = await request(ondraft)
      .post("/reset-password")
      .type("form")
      .send({
        token: rawToken,
        password: "new-password-123",
        confirmPassword: "different-password",
      });
    expect(mismatch.status).toBe(400);
    expect(mismatch.text).toContain("Passwords must match.");

    const reset = await request(ondraft)
      .post("/reset-password")
      .type("form")
      .send({
        token: rawToken,
        password: "new-password-123",
        confirmPassword: "new-password-123",
      });
    expect(reset.status).toBe(200);
    expect(reset.text).toContain("Your password has been reset.");

    const oldLogin = await request(ondraft)
      .post("/login")
      .type("form")
      .send({ email: "reset-reader@ondraft.test", password: "password123" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(ondraft)
      .post("/login")
      .type("form")
      .send({ email: "reset-reader@ondraft.test", password: "new-password-123" });
    expect(newLogin.status).toBe(302);

    const reused = await request(ondraft)
      .post("/reset-password")
      .type("form")
      .send({
        token: rawToken,
        password: "another-password-123",
        confirmPassword: "another-password-123",
      });
    expect(reused.status).toBe(400);
    expect(reused.text).toContain("expired or already used");
  });

  it("rejects registration when password confirmation does not match", async () => {
    const response = await request(app())
      .post("/register")
      .type("form")
      .send({
        displayName: "New Analyst",
        email: "mismatch@ondraft.test",
        password: "password123",
        confirmPassword: "different123",
      });

    expect(response.status).toBe(400);
    expect(response.text).toContain("Passwords must match.");
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

  it("renders the admin dashboard with HTMX tabs for admin workflows", async () => {
    const ondraft = app();

    const anonymous = await request(ondraft).get("/admin");
    expect(anonymous.status).toBe(403);

    const admin = await loginAdminAgent(ondraft);
    const dashboard = await admin.get("/admin");

    expect(dashboard.status).toBe(200);
    expect(dashboard.text).toContain("Admin Dashboard");
    expect(dashboard.text).toContain('hx-get="/admin/tabs/users"');
    expect(dashboard.text).toContain('hx-get="/admin/tabs/content"');
    expect(dashboard.text).toContain('hx-get="/admin/tabs/newsletter"');
    expect(dashboard.text).toContain('hx-get="/admin/tabs/analytics"');
    expect(dashboard.text).toContain("od-text-toggle-group w-full");
    expect(dashboard.text).toContain('href="/admin"');
    expect(dashboard.text).toContain("Admin Dashboard</a>");

    const contentTab = await admin.get("/admin/tabs/content").set("HX-Request", "true");
    expect(contentTab.status).toBe(200);
    expect(contentTab.text).toContain('href="/articles/new"');
    expect(contentTab.text).toContain('href="/bigboard/edit"');
    expect(contentTab.text).toContain('href="/videos/new"');
    expect(contentTab.text).not.toContain("<!doctype html>");

    const newsletterTab = await admin.get("/admin/tabs/newsletter").set("HX-Request", "true");
    expect(newsletterTab.status).toBe(200);
    expect(newsletterTab.text).toContain("Newsletter Desk");
    expect(newsletterTab.text).toContain("Build newsletter");
    expect(newsletterTab.text).toContain('name="articleIds"');
    expect(newsletterTab.text).toContain('name="videoIds"');
    expect(newsletterTab.text).toContain("articleDropdownOpen");
    expect(newsletterTab.text).toContain("videoDropdownOpen");
    expect(newsletterTab.text).toContain("refreshCounts()");
    expect(newsletterTab.text).toContain("articleCount");
    expect(newsletterTab.text).toContain("videoCount");
    expect(newsletterTab.text).toContain("Past newsletters");
    expect(newsletterTab.text).toContain("Resend");
    expect(newsletterTab.text).toContain('hx-post="/admin/newsletters/send"');
    expect(newsletterTab.text).toContain('hx-include="#admin-newsletter-form"');
    expect(newsletterTab.text).toContain("no-reply@ondraftfootball.com");
    expect(newsletterTab.text).not.toContain("<!doctype html>");

    const analyticsTab = await admin.get("/admin/tabs/analytics").set("HX-Request", "true");
    expect(analyticsTab.status).toBe(200);
    expect(analyticsTab.text).toContain("Traffic Dashboard");
    expect(analyticsTab.text).toContain("Last month");
    expect(analyticsTab.text).toContain("Articles");
    expect(analyticsTab.text).toContain("Draft board");
    expect(analyticsTab.text).not.toContain("<!doctype html>");

    const usersTab = await admin.get("/admin/tabs/users").set("HX-Request", "true");
    expect(usersTab.status).toBe(200);
    expect(usersTab.text).toContain("Manage Users");
    expect(usersTab.text).toContain("ryan@ondraftfootball.com");
    expect(usersTab.text).toContain("w-full min-w-[58rem]");
    expect(usersTab.text).not.toContain("<!doctype html>");
  });

  it("lets admins save, edit, and send newsletters through the admin dashboard", async () => {
    const { ondraft, emailService } = appWithEmailCapture();
    const admin = await loginAdminAgent(ondraft);

    await admin
      .post("/settings/mailing-list")
      .type("form")
      .send({ preference: "subscribe" });

    const draft = await admin
      .post("/admin/newsletters/drafts")
      .type("form")
      .send({
        date: "2026-06-05",
        writeup: "This week on OnDraft.",
        articleIds: ["A1001"],
        videoIds: ["BH3X-llq1M4"],
        changelog: "Added the admin newsletter workflow.",
      });

    expect(draft.status).toBe(200);
    expect(draft.text).toContain("Newsletter draft saved.");
    expect(draft.text).toContain("formOpen: false");
    expect(draft.text).toContain("Past newsletters");
    expect(draft.text).toContain("od-secondary-link");
    expect(draft.text).toContain(">Edit</button>");
    expect(draft.text).toContain('hx-get="/admin/newsletters/');
    const draftId = draft.text.match(/hx-get="\/admin\/newsletters\/([^"]+)\/edit"/)?.[1];
    expect(draftId).toBeDefined();

    const edit = await admin.get(`/admin/newsletters/${draftId}/edit`).set("HX-Request", "true");
    expect(edit.status).toBe(200);
    expect(edit.text).toContain('value="A1001" @change="refreshCounts()" checked');
    expect(edit.text).toContain('value="BH3X-llq1M4" @change="refreshCounts()" checked');

    const sent = await admin
      .post("/admin/newsletters/send")
      .type("form")
      .send({
        id: draftId,
        date: "2026-06-05",
        writeup: "This week on OnDraft.",
        articleIds: ["A1001"],
        videoIds: ["BH3X-llq1M4"],
        changelog: "Added the admin newsletter workflow.",
      });

    expect(sent.status).toBe(200);
    expect(sent.text).toContain("Newsletter sent to 1 subscriber.");
    expect(sent.text).toContain("formOpen: false");
    expect(sent.text).toContain("Sent");
    expect(sent.text).not.toContain(">Edit</button>");
    expect(emailService.newsletterEmails).toHaveLength(1);
    expect(emailService.newsletterEmails[0].articles[0]).toMatchObject({
      title: "The league is starving for pressure, and this EDGE class knows it",
      imageUrl: "http://localhost:3000/images/article-defaults/uprights.png",
    });
    expect(emailService.newsletterEmails[0].videos[0]).toMatchObject({
      title: "Quarterback room check-in: what still translates on Sundays",
      imageUrl: "https://img.youtube.com/vi/BH3X-llq1M4/hqdefault.jpg",
    });
    expect(emailService.newsletterEmails[0].logoUrl).toBe("http://localhost:3000/images/brand/OnDraftLogo-cropped.png");
  });

  it("allows partial newsletter drafts but requires send-ready newsletter fields", async () => {
    const { ondraft, emailService } = appWithEmailCapture();
    const admin = await loginAdminAgent(ondraft);

    await admin
      .post("/settings/mailing-list")
      .type("form")
      .send({ preference: "subscribe" });

    const emptyDraft = await admin
      .post("/admin/newsletters/drafts")
      .type("form")
      .send({});

    expect(emptyDraft.status).toBe(200);
    expect(emptyDraft.text).toContain("Newsletter draft saved.");
    expect(emptyDraft.text).toContain("Undated draft");

    const missingDate = await admin
      .post("/admin/newsletters/send")
      .type("form")
      .send({
        writeup: "This week on OnDraft.",
        changelog: "Added the admin newsletter workflow.",
      });

    expect(missingDate.status).toBe(400);
    expect(missingDate.text).toContain("Newsletter date is required before sending.");

    const missingWriteup = await admin
      .post("/admin/newsletters/send")
      .type("form")
      .send({
        date: "2026-06-05",
        changelog: "Added the admin newsletter workflow.",
      });

    expect(missingWriteup.status).toBe(400);
    expect(missingWriteup.text).toContain("Newsletter writeup is required before sending.");

    const missingChangelog = await admin
      .post("/admin/newsletters/send")
      .type("form")
      .send({
        date: "2026-06-05",
        writeup: "This week on OnDraft.",
      });

    expect(missingChangelog.status).toBe(400);
    expect(missingChangelog.text).toContain("Newsletter changelog is required before sending.");
    expect(emailService.newsletterEmails).toHaveLength(0);
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

  it("lets admins open the ban menu, ban users, and unban users from Manage Users", async () => {
    const ondraft = app();
    const reader = request.agent(ondraft);
    await reader
      .post("/register")
      .type("form")
      .send({
        displayName: "Moderated Reader",
        email: "moderated-reader@ondraft.test",
        password: "password123",
        confirmPassword: "password123",
      });

    const admin = await loginAdminAgent(ondraft);
    const usersPage = await admin.get("/admin/users");
    expect(usersPage.status).toBe(200);
    expect(usersPage.text).toContain("Moderation");
    expect(usersPage.text).toContain("moderated-reader@ondraft.test");

    const banMenuPath = usersPage.text.match(/hx-get="([^"]+moderation-menu\?contextId=admin-user-[^"]+)"/)?.[1].replaceAll("&amp;", "&");
    expect(banMenuPath).toBeDefined();
    if (!banMenuPath) return;
    const userId = banMenuPath.match(/\/admin\/users\/([^/]+)\/moderation-menu/)?.[1];
    expect(userId).toBeDefined();
    if (!userId) return;

    const menu = await admin.get(banMenuPath);
    expect(menu.status).toBe(200);
    expect(menu.text).toContain("Ban message");
    expect(menu.text).toContain("Permanent");

    const banned = await admin
      .post(`/admin/users/${userId}/ban`)
      .type("form")
      .send({
        contextId: `admin-user-${userId}`,
        message: "Cool down before posting again.",
        duration: "1-day",
      });
    expect(banned.status).toBe(200);
    expect(banned.text).toContain("Unban");

    const bannedUsersPage = await admin.get("/admin/users");
    expect(bannedUsersPage.status).toBe(200);
    expect(bannedUsersPage.text).toContain("Banned");
    expect(bannedUsersPage.text).toContain("Unban");

    const unbanned = await admin
      .post(`/admin/users/${userId}/unban`)
      .type("form")
      .send({ contextId: `admin-user-${userId}` });
    expect(unbanned.status).toBe(200);
    expect(unbanned.text).toContain("Ban");
    expect(unbanned.text).not.toContain("Unban");
  });

  it("prevents banned users from posting forum content or article comments while keeping pages viewable", async () => {
    const ondraft = app();
    const reader = request.agent(ondraft);
    await reader
      .post("/register")
      .type("form")
      .send({
        displayName: "Bench Timeout",
        email: "bench-timeout@ondraft.test",
        password: "password123",
        confirmPassword: "password123",
      });

    const admin = await loginAdminAgent(ondraft);
    const usersPage = await admin.get("/admin/users");
    const banMenuPath = usersPage.text.match(/hx-get="([^"]+moderation-menu\?contextId=admin-user-[^"]+)"/)?.[1].replaceAll("&amp;", "&");
    expect(banMenuPath).toBeDefined();
    if (!banMenuPath) return;
    const userId = banMenuPath.match(/\/admin\/users\/([^/]+)\/moderation-menu/)?.[1];
    expect(userId).toBeDefined();
    if (!userId) return;

    await admin
      .post(`/admin/users/${userId}/ban`)
      .type("form")
      .send({
        contextId: `admin-user-${userId}`,
        message: "Cool down before posting again.",
        duration: "1-month",
      });

    const createArticle = await admin
      .post("/articles")
      .type("form")
      .send({
        title: "Banned User Comment Target",
        author: "Ryan McWalter",
        writeup: "A short moderation target.",
        publicationDate: "2024-01-01",
        contentType: "plainText",
        content: "A regular article body.",
      });
    expect(createArticle.status).toBe(302);
    const articleId = createArticle.headers.location.split("/").pop();

    const hotTakes = await reader.get("/hottakes");
    expect(hotTakes.status).toBe(200);
    expect(hotTakes.text).toContain("Cool down before posting again.");
    expect(hotTakes.text).toContain("Want to appeal? Email support@ondraftfootball.com.");
    expect(hotTakes.text).not.toContain("Post Hot Take");

    const createHotTake = await reader
      .post("/hottakes")
      .type("form")
      .set("HX-Request", "true")
      .send({ content: "I should not be able to post this." });
    expect(createHotTake.status).toBe(403);
    expect(createHotTake.text).toContain("Cool down before posting again.");

    const article = await reader.get(`/articles/${articleId}`);
    expect(article.status).toBe(200);
    expect(article.text).toContain("Banned User Comment Target");
    expect(article.text).toContain(`hx-get="/articles/${articleId}/comments?limit=10"`);

    const articleComments = await reader.get(`/articles/${articleId}/comments`);
    expect(articleComments.status).toBe(200);
    expect(articleComments.text).toContain("Cool down before posting again.");
    expect(articleComments.text).not.toContain("Post Comment");
    expect(article.text).not.toContain("Post Comment");

    const comment = await reader
      .post(`/articles/${articleId}/comments`)
      .type("form")
      .send({ text: "I should not be able to comment." });
    expect(comment.status).toBe(403);
    expect(comment.text).toContain("Cool down before posting again.");
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
    expect(editor.text).toContain("Add Player");
    expect(editor.text).toContain("Publish");
    expect(editor.text).toContain("data-delete-board-entry");
    expect(editor.text).toContain("data-board-editor-card-list");
    expect(editor.text).toContain("data-expand-entry");
    expect(editor.text).toContain('id="big-board-editor-fragment"');
    expect(editor.text).toContain('hx-get="/bigboard/edit"');
    expect(editor.text).toContain('hx-target="#big-board-editor-fragment"');
    expect(editor.text).toContain('data-loading-skeleton="big-board-editor"');
    expect(editor.text).toContain('data-loading-skeleton-target="#big-board-editor-fragment"');
    expect(editor.text).toContain('action="/bigboard/edit/player"');
    expect(editor.text).toContain('hx-post="/bigboard/edit/player"');
    expect(editor.text).toContain('hx-post="/bigboard/edit/publish-player-info"');
    expect(editor.text).toContain('hx-post="/bigboard/edit/publish-writeup"');
    expect(editor.text).toContain('hx-post="/bigboard/edit/delete-entry"');
    expect(editor.text).toContain("add player writeup");
    expect(editor.text).toContain("Save full board");
    expect(editor.text).toContain("data-board-dirty-actions");
    expect(editor.text).toContain("markBoardStructureDirty");
    expect(editor.text).toContain("scrollToFirstValidationError");
    expect(editor.text).toContain("You have unsaved changes, are you sure you want to exit?");
    expect(editor.text).toContain("/bigboard/edit/delete-entry");
    expect(editor.text).toContain("Are you sure?");
    expect(editor.text).toContain("This cannot be undone.");
    expect(editor.text).toContain('list="college-team-options"');
    expect(editor.text).toContain('<option value="Alabama"></option>');
    expect(editor.text).toContain("data-height-picker");
    expect(editor.text).toContain("data-height-feet");
    expect(editor.text).toContain("data-height-inches");
    expect(editor.text).toContain("data-height-fraction");

    const draft = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "entry-1",
        "entries[0][playerName]": "Hidden Prospect",
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
      });

    expect(publishInfo.status).toBe(200);
    expect(publishInfo.text).toContain("Saved.");

    const visibleWithoutWriteup = await agent.get("/bigboard?year=2026&creator=Ryan");
    expect(visibleWithoutWriteup.status).toBe(200);
    expect(visibleWithoutWriteup.text).toContain("Hidden Prospect");
    expect(visibleWithoutWriteup.text).toContain("Alabama football helmet");
    expect(visibleWithoutWriteup.text).toContain('src="/teamHelmetTemplate.png"');
    expect(visibleWithoutWriteup.text).toContain('loading="lazy"');
    expect(visibleWithoutWriteup.text).toContain('decoding="async"');
    expect(visibleWithoutWriteup.text).toContain('data-generated-helmet-src="/generated/helmets/v1/690014-f1f2f3.png"');
    expect(visibleWithoutWriteup.text).toContain("6&#39;2 3/8&#34;");
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

  it("saves one draft board editor card without replacing neighboring entries", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const saveTwoEntries = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "single-save-entry-1",
        "entries[0][playerName]": "Single Save One",
        "entries[0][school]": "Alabama",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "220",
        "entries[1][id]": "single-save-entry-2",
        "entries[1][playerName]": "Single Save Two",
        "entries[1][school]": "OnDraft State",
        "entries[1][position]": "WR",
        "entries[1][rank]": "2",
        "entries[1][posRank]": "1",
        "entries[1][heightLabel]": "6-0",
        "entries[1][weight]": "195",
      });
    expect(saveTwoEntries.status).toBe(200);

    const saveOne = await agent
      .post("/bigboard/edit/player")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        entryId: "single-save-entry-1",
        "entries[0][id]": "single-save-entry-1",
        "entries[0][playerName]": "Single Save One Updated",
        "entries[0][school]": "Alabama",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "221",
        "entries[0][playerInfoPublished]": "false",
        "entries[0][writeupPublished]": "false",
      });

    expect(saveOne.status).toBe(200);
    expect(saveOne.text).toContain("Saved Single Save One Updated.");
    expect(saveOne.text).toContain("Single Save One Updated");
    expect(saveOne.text).toContain("Single Save Two");

    const htmxSaveOne = await agent
      .post("/bigboard/edit/player")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        entryId: "single-save-entry-1",
        "entries[0][id]": "single-save-entry-1",
        "entries[0][playerName]": "Single Save One HTMX",
        "entries[0][school]": "Alabama",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "222",
        "entries[0][playerInfoPublished]": "false",
        "entries[0][writeupPublished]": "false",
        expandWriteup: "true",
        expandGrade: "true",
      });

    expect(htmxSaveOne.status).toBe(200);
    expect(htmxSaveOne.text).toContain("data-board-entry-item");
    expect(htmxSaveOne.text).toContain("Single Save One HTMX");
    expect(htmxSaveOne.text).toContain('data-expanded="true"');
    expect(htmxSaveOne.text).toContain('data-grade-expanded="true"');
    expect(htmxSaveOne.text).toContain('name="expandWriteup" value="true"');
    expect(htmxSaveOne.text).toContain('name="expandGrade" value="true"');
    expect(htmxSaveOne.text).not.toContain("Edit Big Board");
    expect(htmxSaveOne.text).not.toContain("Single Save Two");

    const htmxPublishInfo = await agent
      .post("/bigboard/edit/publish-player-info")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        entryId: "single-save-entry-1",
        "entries[0][id]": "single-save-entry-1",
        "entries[0][playerName]": "Single Save One HTMX",
        "entries[0][school]": "Alabama",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "222",
        "entries[0][playerInfoPublished]": "false",
        "entries[0][writeupPublished]": "false",
      });

    expect(htmxPublishInfo.status).toBe(200);
    expect(htmxPublishInfo.text).toContain("data-board-entry-item");
    expect(htmxPublishInfo.text).toContain('name="entries[0][playerInfoPublished]" value="true"');
    expect(htmxPublishInfo.text).not.toContain("Edit Big Board");

    const htmxPublishWriteup = await agent
      .post("/bigboard/edit/publish-writeup")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        entryId: "single-save-entry-1",
        "entries[0][id]": "single-save-entry-1",
        "entries[0][playerName]": "Single Save One HTMX",
        "entries[0][school]": "Alabama",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "222",
        "entries[0][strengths]": "HTMX profile strength",
        "entries[0][weaknesses]": "HTMX profile weakness",
        "entries[0][rundown]": "HTMX profile rundown.",
        "entries[0][playerInfoPublished]": "true",
        "entries[0][writeupPublished]": "false",
      });

    expect(htmxPublishWriteup.status).toBe(200);
    expect(htmxPublishWriteup.text).toContain("data-board-entry-item");
    expect(htmxPublishWriteup.text).toContain('name="entries[0][writeupPublished]" value="true"');
    expect(htmxPublishWriteup.text).toContain("data-publish-writeup");
    expect(htmxPublishWriteup.text).toContain("hidden");
    expect(htmxPublishWriteup.text).not.toContain("Edit Big Board");

    const boardAfterWriteupPublish = await request(ondraft).get("/bigboard?year=2026&creator=Ryan");
    expect(boardAfterWriteupPublish.status).toBe(200);
    expect(boardAfterWriteupPublish.text).toContain("HTMX profile rundown.");

    const htmxDelete = await agent
      .post("/bigboard/edit/delete-entry")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        entryId: "single-save-entry-1",
        "entries[0][id]": "single-save-entry-1",
        "entries[0][playerName]": "Single Save One HTMX",
      });

    expect(htmxDelete.status).toBe(200);
    expect(htmxDelete.text).toBe("");

    const boardAfterHtmxDelete = await request(ondraft).get("/bigboard?year=2026&creator=Ryan");
    expect(boardAfterHtmxDelete.status).toBe(200);
    expect(boardAfterHtmxDelete.text).toContain("Single Save One HTMX");

    const editorAfterHtmxDelete = await agent.get("/bigboard/edit?year=2026&creator=Ryan");
    expect(editorAfterHtmxDelete.status).toBe(200);
    expect(editorAfterHtmxDelete.text).toContain("Single Save One HTMX");
    expect(editorAfterHtmxDelete.text).toContain("Single Save Two");

    const saveFullBoardAfterDelete = await agent
      .post("/bigboard/edit")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "single-save-entry-2",
        "entries[0][playerName]": "Single Save Two",
        "entries[0][school]": "OnDraft State",
        "entries[0][position]": "WR",
        "entries[0][rank]": "2",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-0",
        "entries[0][weight]": "195",
        "entries[0][playerInfoPublished]": "false",
        "entries[0][writeupPublished]": "false",
      });

    expect(saveFullBoardAfterDelete.status).toBe(200);
    expect(saveFullBoardAfterDelete.text).toContain("Saved.");
    expect(saveFullBoardAfterDelete.text).toContain('id="big-board-editor-fragment"');
    expect(saveFullBoardAfterDelete.text).not.toContain("<!DOCTYPE html>");

    const boardAfterFullSave = await request(ondraft).get("/bigboard?year=2026&creator=Ryan");
    expect(boardAfterFullSave.status).toBe(200);
    expect(boardAfterFullSave.text).not.toContain("Single Save One HTMX");

    const editorAfterFullSave = await agent.get("/bigboard/edit?year=2026&creator=Ryan");
    expect(editorAfterFullSave.status).toBe(200);
    expect(editorAfterFullSave.text).not.toContain("Single Save One HTMX");
    expect(editorAfterFullSave.text).toContain("Single Save Two");
  });

  it("shows field-level validation errors when publishing invalid draft board cards", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const saveCards = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "validation-published-qb",
        "entries[0][playerName]": "Published QB",
        "entries[0][school]": "Alabama",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "220",
        "entries[0][playerInfoPublished]": "true",
        "entries[1][id]": "validation-unpublished-qb",
        "entries[1][playerName]": "Unpublished QB",
        "entries[1][school]": "OnDraft State",
        "entries[1][position]": "QB",
        "entries[1][rank]": "2",
        "entries[1][posRank]": "1",
        "entries[1][heightLabel]": "6-0",
        "entries[1][weight]": "195",
      });
    expect(saveCards.status).toBe(200);

    const invalidWriteupPublish = await agent
      .post("/bigboard/edit/publish-writeup")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        entryId: "validation-unpublished-qb",
        "entries[0][id]": "validation-unpublished-qb",
        "entries[0][playerName]": "Unpublished QB",
        "entries[0][school]": "OnDraft State",
        "entries[0][position]": "QB",
        "entries[0][rank]": "2",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-0",
        "entries[0][weight]": "195",
        "entries[0][strengths]": "",
        "entries[0][weaknesses]": "Needs cleaner counters.",
        "entries[0][rundown]": "Has enough to test partial validation.",
        "entries[0][playerInfoPublished]": "false",
        "entries[0][writeupPublished]": "false",
      });

    expect(invalidWriteupPublish.status).toBe(200);
    expect(invalidWriteupPublish.headers["hx-retarget"]).toBe("#big-board-editor-fragment");
    expect(invalidWriteupPublish.headers["hx-reswap"]).toBe("outerHTML show:none");
    expect(invalidWriteupPublish.text).toContain("Strengths are required before publishing a player writeup.");
    expect(invalidWriteupPublish.text).toContain("board-editor-profile-box is-validation-error");
    expect(invalidWriteupPublish.text).toContain('data-expanded="true"');

    const duplicatePositionRankPublish = await agent
      .post("/bigboard/edit/publish-player-info")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        entryId: "validation-unpublished-qb",
        "entries[0][id]": "validation-unpublished-qb",
        "entries[0][playerName]": "Unpublished QB",
        "entries[0][school]": "OnDraft State",
        "entries[0][position]": "QB",
        "entries[0][rank]": "2",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-0",
        "entries[0][weight]": "195",
        "entries[0][strengths]": "Enough burst.",
        "entries[0][weaknesses]": "Needs cleaner counters.",
        "entries[0][rundown]": "Has enough to test duplicate ranking.",
        "entries[0][playerInfoPublished]": "false",
        "entries[0][writeupPublished]": "false",
      });

    expect(duplicatePositionRankPublish.status).toBe(200);
    expect(duplicatePositionRankPublish.headers["hx-retarget"]).toBe("#big-board-editor-fragment");
    expect(duplicatePositionRankPublish.headers["hx-reswap"]).toBe("outerHTML show:none");
    expect(duplicatePositionRankPublish.text).toContain("QB1 is already used by Published QB.");
    expect((duplicatePositionRankPublish.text.match(/board-editor-pos-rank-field is-validation-error/g) ?? []).length).toBe(2);
    expect((duplicatePositionRankPublish.text.match(/QB1 is already used by Published QB\./g) ?? []).length).toBe(1);

    const publicBoard = await request(ondraft).get("/bigboard?year=2026&creator=Ryan");
    expect(publicBoard.status).toBe(200);
    expect(publicBoard.text).not.toContain("Unpublished QB");
  });

  it("publishes draft board grades and renders public grade details", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const publishGrade = await agent
      .post("/bigboard/edit/publish-grade")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        entryId: "published-grade-edge",
        "entries[0][id]": "published-grade-edge",
        "entries[0][playerName]": "Published Grade Edge",
        "entries[0][school]": "Alabama",
        "entries[0][position]": "EDGE",
        "entries[0][rank]": "4",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-4",
        "entries[0][weight]": "255",
        "entries[0][playerInfoPublished]": "true",
        "entries[0][gradePublished]": "false",
        "entries[0][writeupPublished]": "false",
        ...edgeGradePayload("entries[0]", "6", "6"),
        "entries[0][grade][value]": "Early 1st Round",
        "entries[0][grade][overrideDisplayGrade]": "7.25",
      });

    expect(publishGrade.status).toBe(200);
    expect(publishGrade.text).toContain("data-board-entry-item");
    expect(publishGrade.text).toContain('name="entries[0][gradePublished]" value="true"');
    expect(publishGrade.text).toContain("Publish Grade");
    expect(publishGrade.text).toContain("Speed");
    expect(publishGrade.text).toContain("Final grade");
    expect(publishGrade.text).toContain('name="entries[0][grade][value]"');
    expect(publishGrade.text).toContain('value="Early 1st Round"');
    expect(publishGrade.text).toContain("Revert to formula");
    expect(publishGrade.text).not.toContain("Edit Big Board");

    const publicBoard = await request(ondraft).get("/bigboard?year=2026&creator=Ryan");

    expect(publicBoard.status).toBe(200);
    expect(publicBoard.text).toContain("Published Grade Edge");
    expect(publicBoard.text).toContain("7.25/8");
    expect(publicBoard.text).toContain("Early 1st Round");
    expect(publicBoard.text).toContain("How we grade players");
    expect(publicBoard.text).toContain('title="Pass Rush Plan"');
    expect(publicBoard.text).toContain("PRP");
    expect(publicBoard.text).not.toContain("Balanced archetype");
  });

  it("removes omitted draft board ranking entries when admins save the editor", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);
    const uniqueSuffix = Date.now().toString();
    const deletedEntryId = `delete-entry-${uniqueSuffix}`;
    const keptEntryId = `keep-entry-${uniqueSuffix}`;
    const deletedPlayerName = `Deleted Prospect ${uniqueSuffix}`;
    const keptPlayerName = `Kept Prospect ${uniqueSuffix}`;

    const saveTwoEntries = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": deletedEntryId,
        "entries[0][playerName]": deletedPlayerName,
        "entries[0][school]": "Alabama",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "220",
        "entries[0][strengths]": "Release",
        "entries[0][weaknesses]": "Pressure",
        "entries[0][rundown]": "First saved entry.",
        "entries[0][playerInfoPublished]": "true",
        "entries[1][id]": keptEntryId,
        "entries[1][playerName]": keptPlayerName,
        "entries[1][school]": "OnDraft State",
        "entries[1][position]": "WR",
        "entries[1][rank]": "2",
        "entries[1][posRank]": "1",
        "entries[1][heightLabel]": "6-0",
        "entries[1][weight]": "195",
        "entries[1][strengths]": "Separation",
        "entries[1][weaknesses]": "Play strength",
        "entries[1][rundown]": "Second saved entry.",
        "entries[1][playerInfoPublished]": "true",
      });

    expect(saveTwoEntries.status).toBe(200);
    expect(saveTwoEntries.text).toContain("Saved.");

    const beforeDelete = await request(ondraft).get("/bigboard?year=2026&creator=Ryan");
    expect(beforeDelete.status).toBe(200);
    expect(beforeDelete.text).toContain(deletedPlayerName);
    expect(beforeDelete.text).toContain(keptPlayerName);

    const saveAfterDelete = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": keptEntryId,
        "entries[0][playerName]": keptPlayerName,
        "entries[0][school]": "OnDraft State",
        "entries[0][position]": "WR",
        "entries[0][rank]": "2",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-0",
        "entries[0][weight]": "195",
        "entries[0][strengths]": "Separation",
        "entries[0][weaknesses]": "Play strength",
        "entries[0][rundown]": "Second saved entry.",
        "entries[0][playerInfoPublished]": "true",
      });

    expect(saveAfterDelete.status).toBe(200);
    expect(saveAfterDelete.text).toContain("Saved.");

    const afterDelete = await request(ondraft).get("/bigboard?year=2026&creator=Ryan");
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.text).not.toContain(deletedPlayerName);
    expect(afterDelete.text).toContain(keptPlayerName);
  }, 15000);

  it("accepts large admin draft board editor saves", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);
    const payload: Record<string, string> = {
      year: "2026",
      creator: "Ryan",
    };

    for (let index = 0; index < 18; index += 1) {
      const row = `entries[${index}]`;
      payload[`${row}[id]`] = `large-entry-${index}`;
      payload[`${row}[playerName]`] = `Large Prospect ${index + 1}`;
      payload[`${row}[school]`] = "OnDraft State";
      payload[`${row}[position]`] = index % 2 === 0 ? "QB" : "WR";
      payload[`${row}[rank]`] = String(index + 1);
      payload[`${row}[posRank]`] = String(index + 1);
      payload[`${row}[heightLabel]`] = "6-2";
      payload[`${row}[weight]`] = "220";
      payload[`${row}[strengths]`] = `Strength ${index} `.repeat(260);
      payload[`${row}[weaknesses]`] = `Weakness ${index} `.repeat(260);
      payload[`${row}[rundown]`] = `Rundown ${index} `.repeat(260);
      payload[`${row}[notes]`] = `Private note ${index} `.repeat(120);
      payload[`${row}[playerInfoPublished]`] = "true";
      payload[`${row}[writeupPublished]`] = "true";
    }

    const save = await agent
      .post("/bigboard/edit")
      .type("form")
      .send(payload);

    expect(save.status).toBe(200);
    expect(save.text).toContain("Saved.");

    const board = await request(ondraft).get("/bigboard?year=2026&creator=Ryan");
    expect(board.status).toBe(200);
    expect(board.text).toContain("Large Prospect 18");
  }, 15000);

  it("ignores blank draft board editor rows when saving and exiting", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);
    const save = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "kept-after-blank",
        "entries[0][playerName]": "Kept After Blank",
        "entries[0][school]": "OnDraft State",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2.125",
        "entries[0][weight]": "220",
        "entries[0][strengths]": "Timing",
        "entries[0][weaknesses]": "Pressure",
        "entries[0][rundown]": "Clean saved row.",
        "entries[0][playerInfoPublished]": "true",
        "entries[1][id]": "blank-row",
        "entries[1][playerName]": "",
        "entries[1][school]": "",
        "entries[1][position]": "",
        "entries[1][rank]": "",
        "entries[1][posRank]": "",
        "entries[1][heightLabel]": "",
        "entries[1][weight]": "",
        "entries[1][strengths]": "",
        "entries[1][weaknesses]": "",
        "entries[1][rundown]": "",
        "entries[1][notes]": "",
        action: "exit",
      });

    expect(save.status).toBe(302);
    expect(save.headers.location).toBe("/bigboard?year=2026&creator=Ryan");

    const board = await request(ondraft).get("/bigboard?year=2026&creator=Ryan");
    expect(board.status).toBe(200);
    expect(board.text).toContain("Kept After Blank");
    expect(board.text).toContain("6&#39;2 1/8&#34;");
    expect(board.text).not.toContain("blank-row");
  });

  it("renders a friendly full page when draft board saves exceed the body limit", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);
    const response = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "too-large-row",
        "entries[0][notes]": "x".repeat(1024 * 1024 + 1),
      });

    expect(response.status).toBe(413);
    expect(response.text).toContain("<!doctype html>");
    expect(response.text).toContain("That save is too large to process at once.");
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
    expect(fullBoard.text).toContain('<select name="position" onchange=');
    expect(fullBoard.text).toContain('hx-push-url="true"');
    expect(fullBoard.text).toContain('<option value="" selected>All</option>');
    expect(fullBoard.text).toContain('<option value="QB"');
    expect(fullBoard.text).toContain('<option value="OnDraft State"');
    expect(fullBoard.text).toContain('<option value="Mock Tech"');
    expect(fullBoard.text).not.toContain("Apply filters");
    expect(fullBoard.text).not.toContain("Reset");
    expect(fullBoard.text).toContain('id="draft-board-info-popover"');
    expect(fullBoard.text).toContain("x-bind:hidden=\"!infoOpen\"");
    expect(fullBoard.text).toContain("hidden");
    expect(fullBoard.text).toMatch(/>\s*Ryan\s*<\/button>/);
    expect(fullBoard.text).toMatch(/>\s*Aleks\s*<\/button>/);
    expect(fullBoard.text).toMatch(/>\s*Consensus\s*<\/button>/);
    expect(fullBoard.text).toContain("Player analysis and opinions by");
    expect(fullBoard.text).toContain('href="/about#ryan-mcwalter"');
    expect(fullBoard.text).toContain("Ryan McWalter");

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
    expect(filteredBoard.text).toContain('id="draft-board-info-popover"');
    expect(filteredBoard.text).toContain("x-bind:hidden=\"!infoOpen\"");
    expect(filteredBoard.text).toContain('href="/about#ryan-mcwalter"');

    const resetBoard = await request(ondraft)
      .get("/bigboard?year=2026&creator=Ryan")
      .set("HX-Request", "true");

    expect(resetBoard.status).toBe(200);
    expect(resetBoard.text).toContain("Quarterback Prospect");
    expect(resetBoard.text).toContain("Receiver Prospect");
    expect(resetBoard.text).not.toContain("Reset");
    expect(resetBoard.text).toContain("x-bind:hidden=\"!infoOpen\"");
  });

  it("renders the consensus big board with sequential published rankings and discrepancy badges", async () => {
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
        "entries[0][strengths]": "Copied Ryan strength should not appear.",
        "entries[0][weaknesses]": "Copied Ryan weakness should not appear.",
        "entries[0][rundown]": "Copied Ryan rundown should not appear.",
        "entries[0][writeupPublished]": "true",
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
        "entries[3][id]": "ryan-one-board-edge",
        "entries[3][playerName]": "One Board Edge",
        "entries[3][school]": "Solo State",
        "entries[3][position]": "EDGE",
        "entries[3][rank]": "2",
        "entries[3][posRank]": "5",
        "entries[3][heightLabel]": "6-5",
        "entries[3][weight]": "260",
        "entries[3][playerInfoPublished]": "true",
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
    expect(consensus.text).toContain('href="/about#ryan-mcwalter"');
    expect(consensus.text).toContain('href="/about#aleks-ryabinkin"');
    expect(consensus.text).toMatch(/1\. One Board Edge[\s\S]*EDGE1/);
    expect(consensus.text).toMatch(/2\. Edge Prospect[\s\S]*EDGE2/);
    expect(consensus.text).toMatch(/3\. Quarterback Prospect[\s\S]*QB1/);
    expect(consensus.text).toMatch(/Ryan(?:&#39;|')s Rank:\s*<strong>4<\/strong>[\s\S]*Aleks(?:&#39;|')s Rank:\s*<strong>6<\/strong>/);
    expect(consensus.text).toMatch(/Ryan(?:&#39;|')s Rank:\s*<strong>1<\/strong>[\s\S]*Aleks(?:&#39;|')s Rank:\s*<strong>13<\/strong>/);
    expect(consensus.text).toContain("Ryan State");
    expect(consensus.text).not.toContain("Aleks Tech");
    expect(consensus.text).toContain("Big discrepancy");
    expect(consensus.text).toMatch(/4\. Tackle Prospect[\s\S]*Published U/);
    expect(consensus.text).toMatch(/Tackle Prospect[\s\S]*Ryan(?:&#39;|')s Rank:\s*<strong>10<\/strong>/);
    expect(consensus.text).not.toMatch(/Tackle Prospect[\s\S]*Aleks(?:&#39;|')s Rank:\s*<strong>30<\/strong>/);
    expect(consensus.text).not.toContain("Private U");
    expect(consensus.text).not.toContain("read player profile");
    expect(consensus.text).not.toContain("RUNDOWN");
    expect(consensus.text).not.toContain("STRENGTHS");
    expect(consensus.text).not.toContain("Copied Ryan strength should not appear.");
    expect(consensus.text).not.toContain("Copied Ryan weakness should not appear.");
    expect(consensus.text).not.toContain("Copied Ryan rundown should not appear.");
  });

  it("lets admins draft and publish consensus discrepancy explanations", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const saveRyan = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Ryan",
        "entries[0][id]": "disc-ryan-qb",
        "entries[0][playerName]": "Discrepancy Quarterback",
        "entries[0][school]": "Ryan State",
        "entries[0][position]": "QB",
        "entries[0][rank]": "1",
        "entries[0][posRank]": "1",
        "entries[0][heightLabel]": "6-2",
        "entries[0][weight]": "220",
        "entries[0][playerInfoPublished]": "true",
      });
    expect(saveRyan.status).toBe(200);

    const saveAleks = await agent
      .post("/bigboard/edit")
      .type("form")
      .send({
        year: "2026",
        creator: "Aleks",
        "entries[0][id]": "disc-aleks-qb",
        "entries[0][playerName]": "Discrepancy Quarterback",
        "entries[0][school]": "Aleks Tech",
        "entries[0][position]": "QB",
        "entries[0][rank]": "20",
        "entries[0][posRank]": "4",
        "entries[0][heightLabel]": "6-1",
        "entries[0][weight]": "215",
        "entries[0][playerInfoPublished]": "true",
      });
    expect(saveAleks.status).toBe(200);

    const adminConsensus = await agent.get("/bigboard?year=2026&creator=Consensus");
    expect(adminConsensus.status).toBe(200);
    expect(adminConsensus.text).toContain("Big discrepancy");
    expect(adminConsensus.text).toContain('hx-post="/bigboard/consensus/discrepancy-writeup"');
    expect(adminConsensus.text).toContain('hx-post="/bigboard/consensus/discrepancy-writeup/publish"');
    expect(adminConsensus.text).toContain("Explanation draft");
    expect(adminConsensus.text).toContain("Why Ryan is high on this player:");
    expect(adminConsensus.text).toContain("Why Aleks is low on this player:");
    expect(adminConsensus.text).toContain("consensus-discrepancy-controls-card-2026-Discrepancy-Quarterback");
    expect(adminConsensus.text).not.toContain("consensus-discrepancy-controls-list-2026-Discrepancy-Quarterback");
    expect(adminConsensus.text).not.toContain("read player profile");

    const publicBeforeSave = await request(ondraft).get("/bigboard?year=2026&creator=Consensus");
    expect(publicBeforeSave.status).toBe(200);
    expect(publicBeforeSave.text).toContain("Big discrepancy");
    expect(publicBeforeSave.text).not.toContain("See why");

    const saveOneSide = await agent
      .post("/bigboard/consensus/discrepancy-writeup")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        playerName: "Discrepancy Quarterback",
        ryanWriteup: "Ryan is buying the processing and pocket courage.",
        aleksWriteup: "",
      });
    expect(saveOneSide.status).toBe(200);
    expect(saveOneSide.text).toContain("Saved.");
    expect(saveOneSide.text).toContain("Explanation draft");
    expect(saveOneSide.text).toContain("Ryan is buying the processing and pocket courage.");
    expect(saveOneSide.text).toContain('hx-post="/bigboard/consensus/discrepancy-writeup/publish"');

    const publicAfterDraft = await request(ondraft).get("/bigboard?year=2026&creator=Consensus");
    expect(publicAfterDraft.status).toBe(200);
    expect(publicAfterDraft.text).not.toContain("Ryan is buying the processing and pocket courage.");
    expect(publicAfterDraft.text).not.toContain("See why");

    const publishMissingAleks = await agent
      .post("/bigboard/consensus/discrepancy-writeup/publish")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        playerName: "Discrepancy Quarterback",
        ryanWriteup: "Ryan is buying the processing and pocket courage.",
        aleksWriteup: "",
      });
    expect(publishMissingAleks.status).toBe(200);
    expect(publishMissingAleks.text).toContain("Ryan and Aleks discrepancy explanations are required before publishing.");
    expect(publishMissingAleks.text).toContain("Aleks's explanation is required before publishing.");
    expect(publishMissingAleks.text).not.toContain("Ryan's explanation is required before publishing.");

    const publishBoth = await agent
      .post("/bigboard/consensus/discrepancy-writeup/publish")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        playerName: "Discrepancy Quarterback",
        ryanWriteup: "Ryan is buying the processing and pocket courage.",
        aleksWriteup: "Aleks wants cleaner late-down answers before moving him up.",
      });
    expect(publishBoth.status).toBe(200);
    expect(publishBoth.text).toContain("Published.");
    expect(publishBoth.text).toContain("Explanation published");
    expect(publishBoth.text).toContain('"editMode":false');
    expect(publishBoth.text).toContain('hx-swap-oob="outerHTML"');
    expect(publishBoth.text).toContain("consensus-discrepancy-controls-card-2026-Discrepancy-Quarterback");
    expect(publishBoth.text).not.toContain("consensus-discrepancy-controls-list-2026-Discrepancy-Quarterback");
    expect(publishBoth.text).toContain("See why");
    expect(publishBoth.text).toContain('x-show="!savedPublished"');
    expect(publishBoth.text).not.toContain('x-show="!savedPublished ||');
    expect(publishBoth.text).toContain("consensus-discrepancy-panel-actions");
    expect(publishBoth.text).toContain(":aria-label=\"editMode ? 'Cancel editing discrepancy explanation' : 'Edit discrepancy explanation'\"");
    expect(publishBoth.text).toContain('x-show="!editMode"');
    expect(publishBoth.text).toContain('x-show="editMode"');

    const savePublishedEdit = await agent
      .post("/bigboard/consensus/discrepancy-writeup")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        playerName: "Discrepancy Quarterback",
        ryanWriteup: "Ryan still trusts the processing and pocket courage.",
        aleksWriteup: "Aleks still wants cleaner late-down answers before moving him up.",
      });
    expect(savePublishedEdit.status).toBe(200);
    expect(savePublishedEdit.text).toContain("Saved.");
    expect(savePublishedEdit.text).toContain("Explanation draft");
    expect(savePublishedEdit.text).toContain('"editMode":true');
    expect(savePublishedEdit.text).toContain('"savedPublished":false');
    expect(savePublishedEdit.text).toContain("consensus-discrepancy-panel-actions");
    expect(savePublishedEdit.text).toContain(":aria-label=\"editMode ? 'Cancel editing discrepancy explanation' : 'Edit discrepancy explanation'\"");
    expect(savePublishedEdit.text).toContain('x-show="!savedPublished"');

    const republishEdit = await agent
      .post("/bigboard/consensus/discrepancy-writeup/publish")
      .set("HX-Request", "true")
      .type("form")
      .send({
        year: "2026",
        playerName: "Discrepancy Quarterback",
        ryanWriteup: "Ryan still trusts the processing and pocket courage.",
        aleksWriteup: "Aleks still wants cleaner late-down answers before moving him up.",
      });
    expect(republishEdit.status).toBe(200);
    expect(republishEdit.text).toContain("Published.");
    expect(republishEdit.text).toContain('"editMode":false');
    expect(republishEdit.text).toContain('"savedPublished":true');
    expect(republishEdit.text).toContain("consensus-discrepancy-panel-actions");
    expect(republishEdit.text).toContain('x-show="!editMode"');
    expect(republishEdit.text).toContain('x-show="editMode"');

    const publicAfterPublish = await request(ondraft).get("/bigboard?year=2026&creator=Consensus");
    expect(publicAfterPublish.status).toBe(200);
    expect(publicAfterPublish.text).toContain("See why");
    expect(publicAfterPublish.text).toContain("Ryan still trusts the processing and pocket courage.");
    expect(publicAfterPublish.text).toContain("Aleks still wants cleaner late-down answers before moving him up.");
    expect(publicAfterPublish.text).not.toContain('hx-post="/bigboard/consensus/discrepancy-writeup"');
  });

  it("lets admins create a new big board year from the editor", async () => {
    const ondraft = app();
    const agent = await loginAdminAgent(ondraft);

    const editor = await agent.get("/bigboard/edit");
    expect(editor.status).toBe(200);
    expect(editor.text).toContain("Create draft class");
    expect(editor.text).toContain('data-board-editor-card-list');
    expect(editor.text).toContain('data-add-player');
    expect(editor.text).toContain("initializeForm");

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

    const page = await agent.get("/hottakes");
    expect(page.status).toBe(200);
    expect(page.text).toContain('x-text="content.length"');
    expect(page.text).toContain("/300 characters");

    const create = await agent
      .post("/hottakes")
      .type("form")
      .set("HX-Request", "true")
      .send({ content: "Never draft a round-one long snapper." });

    expect(create.status).toBe(200);
    expect(create.text).toContain("Never draft a round-one long snapper.");
    expect(create.text).toContain("hx-swap-oob");
    expect(create.text).toContain("verified-admin-badge");
    expect(create.text).toContain("Verified OnDraft admin");
    expect(create.text).toContain("Report");
    expect(create.text).toContain("mailto:support@ondraftfootball.com");

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
    expect(comment.text).toContain("verified-admin-badge");
    expect(comment.text).toContain(`hx-delete="/hottakes/${postId}/comments/`);
    expect(comment.text).toContain("Report");
    expect(comment.text).toContain("hot%20take%20comment");

    const commentId = comment.text.match(/id="hot-take-comment-([A-Za-z0-9]{8})"/)?.[1];
    expect(commentId).toBeTruthy();

    const deleteComment = await agent
      .delete(`/hottakes/${postId}/comments/${commentId}`)
      .set("HX-Request", "true");
    expect(deleteComment.status).toBe(200);
    expect(deleteComment.text).not.toContain("Counterpoint: special teams matter.");

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
    expect(bookmarks.text).toContain(`hx-post="/articles/${articleId}/bookmark"`);
    expect(bookmarks.text).toContain(`hx-target="#article-bookmark-${articleId}"`);
    expect(bookmarks.text).toContain("Bookmark this hot take.");
    expect(bookmarks.text).toContain(`/hottakes#hot-take-${postId}`);
    expect(bookmarks.text).toContain(`hx-post="/hottakes/${postId}/bookmark"`);
    expect(bookmarks.text).toContain(`hx-target="#forum-post-bookmark-${postId}"`);

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
    expect(form.text).toContain('class="tag-editor"');
    expect(form.text).toContain('data-tag-input');
    expect(form.text).toContain('data-tag-toggle');
    expect(form.text).toContain('data-tag-value');
    expect(form.text).toContain('<script src="/articleTags.js" defer></script>');

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
    expect(invalid.text).toContain('class="tag-editor"');
    expect(invalid.text).toContain('value="draft" data-tag-value');

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
    expect(videos.text).toContain('id="video-filter-panel"');
    expect(videos.text).toContain('name="dateFrom"');
    expect(videos.text).toContain('name="dateTo"');
    expect(videos.text).toContain('value="film-room" data-tag-checkbox');
    expect(videos.text).not.toContain("YOUTUBE_API_KEY");

    const filtered = await request(ondraft).get("/videos?keyword=quarterback&tags=qb&sortBy=date&sortDirection=asc");
    expect(filtered.status).toBe(200);
    expect(filtered.text).toContain("Quarterback Film");
    expect(filtered.text).not.toContain("Receiver Notes");
    expect(filtered.text).toContain('value="quarterback"');
    expect(filtered.text).toContain('name="tags" value="qb" data-tag-value');
    expect(filtered.text).toContain('value="qb" data-tag-checkbox checked');
    expect(filtered.text).toContain('<option value="asc" selected>Ascending</option>');

    const dateExcluded = await request(ondraft).get("/videos?dateTo=2000-01-01");
    expect(dateExcluded.status).toBe(200);
    expect(dateExcluded.text).not.toContain("Quarterback Film");
    expect(dateExcluded.text).not.toContain("Receiver Notes");

    const adminVideos = await agent.get("/videos");
    expect(adminVideos.status).toBe(200);
    expect(adminVideos.text).toContain('href="/videos/dQw4w9WgXcQ/edit"');
    expect(adminVideos.text).toContain('action="/videos/dQw4w9WgXcQ/delete"');

    const editForm = await agent.get("/videos/dQw4w9WgXcQ/edit");
    expect(editForm.status).toBe(200);
    expect(editForm.text).toContain("Edit YouTube Video");
    expect(editForm.text).toContain('value="Quarterback Film"');
    expect(editForm.text).toContain('value="film-room,qb" data-tag-value');
    expect(editForm.text).toContain('value="film-room" data-tag-checkbox checked');

    const update = await agent
      .post("/videos/dQw4w9WgXcQ")
      .type("form")
      .send({
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Quarterback Film Updated",
        description: "Updated quarterback processing notes.",
        tags: "film-room,qb,updated",
      });
    expect(update.status).toBe(302);
    expect(update.headers.location).toBe("/videos");

    const updatedVideos = await request(ondraft).get("/videos");
    expect(updatedVideos.text).toContain("Quarterback Film Updated");
    expect(updatedVideos.text).toContain("Receiver Notes");

    const remove = await agent.post("/videos/oHg5SJYRHA0/delete");
    expect(remove.status).toBe(302);
    expect(remove.headers.location).toBe("/videos");

    const afterDelete = await request(ondraft).get("/videos");
    expect(afterDelete.text).toContain("Quarterback Film Updated");
    expect(afterDelete.text).not.toContain("Receiver Notes");
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
    expect(article.text).toContain('<meta property="og:type" content="article"');
    expect(article.text).toContain('<meta property="og:image" content="http://localhost:3000/images/article-defaults/');
    expect(article.text).toContain('<meta property="article:author" content="Ryan McWalter"');
    expect(article.text).toContain('<meta property="article:tag" content="draft"');
    expect(article.text).toContain('<meta name="twitter:image:alt" content="Plain Text Film Room article thumbnail"');
    expect(article.text).toContain('"@type":"Article"');
    expect(article.text).toContain('class="icon-button article-share-button"');
    expect(article.text).toContain('data-share-url="/articles/');
    expect(article.text).toContain("Share");

    const articles = await agent.get("/articles");

    expect(articles.status).toBe(200);
    expect(articles.text).toContain("A short plain text summary.");
    expect(articles.text).toContain("draft");
    expect(articles.text).toContain("film-room");
    expect(articles.text).toContain('id="article-filter-tag-options"');
    expect(articles.text).toContain('value="draft" data-tag-checkbox');
    expect(articles.text).toContain('name="tags" value="" data-tag-value');

    const tagFiltered = await agent.get("/articles?tags=film-room");
    expect(tagFiltered.status).toBe(200);
    expect(tagFiltered.text).toContain("Plain Text Film Room");
    expect(tagFiltered.text).toContain('name="tags" value="film-room" data-tag-value');
    expect(tagFiltered.text).toContain('value="film-room" data-tag-checkbox checked');
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

    const article = await request(ondraft).get(articlePath);
    expect(article.status).toBe(200);
    expect(article.text).toContain(`hx-get="/articles/${articleId}/comments?limit=10"`);
    expect(article.text).toContain('hx-trigger="revealed"');
    expect(article.text).toContain("Loading comments");

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
        confirmPassword: "password123",
      });

    const unverifiedComment = await reader
      .post(`/articles/${articleId}/comments`)
      .type("form")
      .send({ text: "Good read." });

    expect(unverifiedComment.status).toBe(403);
    expect(unverifiedComment.text).toContain("Verify your email before commenting.");
    expect(unverifiedComment.text).toContain('id="article-comments-section"');

    const unverifiedBookmark = await reader
      .post(`/articles/${articleId}/bookmark`)
      .set("HX-Request", "true");
    expect(unverifiedBookmark.status).toBe(200);
    expect(unverifiedBookmark.text).toContain("is-bookmarked");

    const comment = await admin
      .post(`/articles/${articleId}/comments`)
      .type("form")
      .send({ text: "Good read." });

    expect(comment.status).toBe(200);
    expect(comment.text).toContain("Good read.");
    expect(comment.text).toContain("Ryan McWalter");
    expect(comment.text).toContain("verified-admin-badge");
    expect(comment.text).toContain("Verified OnDraft admin");
    expect(comment.text).toContain("Report");
    expect(comment.text).toContain("article%20comment");

    const commentId = comment.text.match(/id="comment-([A-Za-z0-9]{8})"/)?.[1];
    expect(commentId).toBeDefined();

    const reply = await admin
      .post(`/articles/${articleId}/comments/${commentId}/replies`)
      .type("form")
      .send({ text: "Agree with this." });

    expect(reply.status).toBe(200);
    expect(reply.text).toContain("Agree with this.");
    expect(reply.text).toContain("reply-list");
    expect(reply.text).toContain("verified-admin-badge");
    expect(reply.text).toContain("article%20reply");

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

    const firstPage = await admin.get(`/articles/${articleId}/comments`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.text).toContain('id="article-comments-section"');
    expect(firstPage.text).toContain('hx-post="/articles/');
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
    const currentFavoriteDate = new Date();
    currentFavoriteDate.setDate(currentFavoriteDate.getDate() - 1);
    const currentFavorite = await admin
      .post("/articles")
      .type("form")
      .send({
        title: "Current Favorite Article",
        author: "Ryan McWalter",
        writeup: "Current summary.",
        publicationDate: currentFavoriteDate.toISOString().slice(0, 10),
        contentType: "plainText",
        content: "Current article body.",
      });

    const olderId = older.headers.location.split("/").pop();
    const newerId = newer.headers.location.split("/").pop();
    const currentFavoriteId = currentFavorite.headers.location.split("/").pop();
    await request(ondraft).post(`/articles/${olderId}/like`);
    await request(ondraft).post(`/articles/${currentFavoriteId}/like`);
    await admin
      .post(`/articles/${newerId}/comments`)
      .type("form")
      .send({ text: "Newer comment." });

    const articlesPage = await request(ondraft).get("/articles");
    expect(articlesPage.status).toBe(200);
    expect(articlesPage.text).toContain('name="sortBy"');
    expect(articlesPage.text).toContain('name="sortDirection"');
    expect(articlesPage.text).toMatch(/Author[\s\S]*Tags[\s\S]*To[\s\S]*From/);
    expect(articlesPage.text).toContain("htmx.trigger(this.form, 'submit')");

    const dateAsc = await request(ondraft).get("/articles/filter?sortBy=date&sortDirection=asc");
    expect(dateAsc.text.indexOf("Older Sort Article")).toBeLessThan(dateAsc.text.indexOf("Newer Sort Article"));

    const likesDesc = await request(ondraft).get("/articles/filter?sortBy=likes&sortDirection=desc");
    expect(likesDesc.text.indexOf("Older Sort Article")).toBeLessThan(likesDesc.text.indexOf("Newer Sort Article"));

    const commentsDesc = await request(ondraft).get("/articles/filter?sortBy=comments&sortDirection=desc");
    expect(commentsDesc.text.indexOf("Newer Sort Article")).toBeLessThan(commentsDesc.text.indexOf("Older Sort Article"));

    const allPopular = await request(ondraft).get("/articles/popular?range=all").set("HX-Request", "true");
    expect(allPopular.status).toBe(200);
    expect(allPopular.text).not.toContain('id="popular-articles-panel"');
    expect(allPopular.text).toContain("Older Sort Article");
    expect(allPopular.text).toContain("Current Favorite Article");

    const yearPopular = await request(ondraft).get("/articles/popular?range=year").set("HX-Request", "true");
    expect(yearPopular.status).toBe(200);
    expect(yearPopular.text).not.toContain("Older Sort Article");
    expect(yearPopular.text).toContain("Current Favorite Article");
  });

  it("defaults articles to list view for mobile visitors without changing desktop", async () => {
    const ondraft = app();
    const mobileUserAgent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

    const desktop = await request(ondraft).get("/articles");
    const mobile = await request(ondraft).get("/articles").set("User-Agent", mobileUserAgent);
    const explicitMobileCard = await request(ondraft).get("/articles?view=card").set("User-Agent", mobileUserAgent);

    expect(desktop.text).toContain("articleView: 'card'");
    expect(mobile.text).toContain("articleView: 'list'");
    expect(mobile.text).toContain("article-list-row od-card");
    expect(explicitMobileCard.text).toContain("articleView: 'card'");
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
        content: '<h2>Film Room</h2><p onclick="alert(1)">Safe copy</p><img src="/generated/article-images/v1/1234567890abcdef-pocket-passer.png" alt="Pocket passer"><script>alert(1)</script><iframe src="https://example.com"></iframe>',
      });

    expect(create.status).toBe(302);

    const article = await agent.get(create.headers.location);

    expect(article.status).toBe(200);
    expect(article.text).toContain('<div class="article-body article-html-body"><h2>Film Room</h2><p>Safe copy</p><img src="/generated/article-images/v1/1234567890abcdef-pocket-passer.png" alt="Pocket passer" /></div>');
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
    expect(createForm.text).toContain('type="date" name="publicationDate"');
    expect(createForm.text).toContain('data-hook-count');
    expect(createForm.text).toContain('data-hook-max-words="300"');
    expect(createForm.text.indexOf('data-tag-editor')).toBeLessThan(createForm.text.indexOf('data-hook-input'));

    const pdfFields = await agent.get("/articles/new/content-fields?contentType=pdf");
    expect(pdfFields.status).toBe(200);
    expect(pdfFields.text).toContain('type="file" name="pdf"');
    expect(pdfFields.text).not.toContain("<textarea");

    const htmlFields = await agent.get("/articles/new/content-fields?contentType=html");
    expect(htmlFields.status).toBe(200);
    expect(htmlFields.text).toContain("HTML content");
    expect(htmlFields.text).toContain("<textarea");
    expect(htmlFields.text).toContain('data-html-image-uploader');
    expect(htmlFields.text).toContain('name="htmlImage"');

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
    expect(missing.text).toContain("Article not found");
    expect(missing.text).toContain("spilled-mug");
  });

  it("renders themed not-found pages for missing videos and routes", async () => {
    const ondraft = app();

    const missingVideo = await request(ondraft).get("/videos/not-a-video");
    expect(missingVideo.status).toBe(404);
    expect(missingVideo.text).toContain("Video not found");
    expect(missingVideo.text).toContain("spilled-mug");

    const missingPage = await request(ondraft).get("/missing-page");
    expect(missingPage.status).toBe(404);
    expect(missingPage.text).toContain("Page not found");
    expect(missingPage.text).toContain("spilled-mug");
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
    expect(article.text).toMatch(/<meta property="og:image" content="http:\/\/localhost:3000\/uploads\/articles\/[^"]+cover\.png"/);
    expect(article.text).toMatch(/<meta name="twitter:image" content="http:\/\/localhost:3000\/uploads\/articles\/[^"]+cover\.png"/);

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
