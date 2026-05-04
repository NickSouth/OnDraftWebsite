import { CreateInMemoryWebsiteRepository } from "../../src/repository/InMemoryWebsiteRepository";
import { CreateWebsiteService } from "../../src/service/WebsiteService";

function service() {
  return CreateWebsiteService(CreateInMemoryWebsiteRepository());
}

describe("WebsiteService article validation", () => {
  it("generates a five character alphanumeric article id", async () => {
    const result = await service().createArticle({
      title: "Draft Notes",
      author: "Alice Website",
      writeup: "A short draft summary.",
      publicationDate: new Date("2024-01-01"),
      content: {
        type: "plainText",
        text: "A regular article body.",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.id).toMatch(/^[A-Za-z0-9]{5}$/);
    }
  });

  it("keeps draft articles out of the published article list", async () => {
    const websiteService = service();
    const draft = await websiteService.createArticle({
      title: "Draft Notes",
      author: "Alice Website",
      writeup: "A short draft summary.",
      published: false,
      publicationDate: new Date("2024-01-01"),
      content: {
        type: "plainText",
        text: "A regular article body.",
      },
    });

    expect(draft.ok).toBe(true);
    if (draft.ok === true) {
      expect(draft.value.published).toBe(false);
    }

    const publishedArticles = await websiteService.getArticles();
    const draftArticles = await websiteService.getArticles(false);

    expect(publishedArticles.ok).toBe(true);
    expect(draftArticles.ok).toBe(true);
    if (publishedArticles.ok === true && draftArticles.ok === true) {
      expect(publishedArticles.value).toHaveLength(0);
      expect(draftArticles.value).toHaveLength(1);
      expect(draftArticles.value[0].title).toBe("Draft Notes");
    }
  });

  it("rejects empty plain text article content", async () => {
    const result = await service().createArticle({
      title: "Draft Notes",
      author: "Alice Website",
      writeup: "A short draft summary.",
      publicationDate: new Date("2024-01-01"),
      content: {
        type: "plainText",
        text: "   ",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.value.name).toBe("ArticleValidationError");
      expect(result.value.message).toContain("content cannot be empty");
    }
  });

  it("normalizes unique short tags and rejects long writeups", async () => {
    const created = await service().createArticle({
      title: "Tagged Notes",
      author: "Alice Website",
      writeup: "A short tagged summary.",
      tags: ["Draft", "draft", "Film Room"],
      publicationDate: new Date("2024-01-01"),
      content: {
        type: "plainText",
        text: "A regular article body.",
      },
    });

    expect(created.ok).toBe(true);
    if (created.ok === true) {
      expect(created.value.tags).toEqual(["draft", "film-room"]);
    }

    const rejected = await service().createArticle({
      title: "Long Writeup",
      author: "Alice Website",
      writeup: "x".repeat(201),
      publicationDate: new Date("2024-01-01"),
      content: {
        type: "plainText",
        text: "A regular article body.",
      },
    });

    expect(rejected.ok).toBe(false);
    if (rejected.ok === false) {
      expect(rejected.value.message).toContain("Writeup cannot be more than 200 characters");
    }
  });

  it("rejects invalid PDF article content metadata", async () => {
    const result = await service().createArticle({
      title: "PDF Notes",
      author: "Alice Website",
      writeup: "A short PDF summary.",
      publicationDate: new Date("2024-01-01"),
      content: {
        type: "pdf",
        url: "",
        originalName: "notes.pdf",
        mimeType: "application/pdf",
        size: 100,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.value.name).toBe("ArticleValidationError");
      expect(result.value.message).toContain("valid PDF");
    }
  });

  it("sanitizes HTML article content before saving", async () => {
    const result = await service().createArticle({
      title: "HTML Notes",
      author: "Alice Website",
      writeup: "A short HTML summary.",
      publicationDate: new Date("2024-01-01"),
      content: {
        type: "html",
        body: '<h2>Film Room</h2><p onclick="alert(1)">Safe copy</p><script>alert(1)</script><iframe src="https://example.com"></iframe>',
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.content).toEqual({
        type: "html",
        body: "<h2>Film Room</h2><p>Safe copy</p>",
      });
    }
  });
});
