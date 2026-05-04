import { CreateInMemoryWebsiteRepository } from "../../src/repository/InMemoryWebsiteRepository";
import { CreateWebsiteService } from "../../src/service/WebsiteService";

function service() {
  return CreateWebsiteService(CreateInMemoryWebsiteRepository());
}

describe("WebsiteService article validation", () => {
  it("rejects empty plain text article content", async () => {
    const result = await service().createArticle({
      title: "Draft Notes",
      author: "Alice Website",
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

  it("rejects invalid PDF article content metadata", async () => {
    const result = await service().createArticle({
      title: "PDF Notes",
      author: "Alice Website",
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
});
