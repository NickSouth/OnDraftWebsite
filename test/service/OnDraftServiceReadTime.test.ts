import { CreateInMemoryOnDraftRepository } from "../../src/repository/InMemoryOnDraftRepository";
import { CreateOnDraftService } from "../../src/service/OnDraftService";
import type { ArticleContent } from "../../src/model/OnDraftContent";

function service() {
  return CreateOnDraftService(CreateInMemoryOnDraftRepository({ seedContent: false }));
}

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
}

function plainText(text: string): ArticleContent {
  return { type: "plainText", text };
}

function html(body: string): ArticleContent {
  return { type: "html", body };
}

describe("articleReadMinutes", () => {
  it("rounds a 450-word plain text article up to 3 minutes", () => {
    expect(service().articleReadMinutes({ content: plainText(words(450)) })).toBe(3);
  });

  it("computes the 200-word-per-minute boundary correctly", () => {
    expect(service().articleReadMinutes({ content: plainText(words(200)) })).toBe(1);
    expect(service().articleReadMinutes({ content: plainText(words(201)) })).toBe(2);
  });

  it("returns a minimum of 1 minute for a single word", () => {
    expect(service().articleReadMinutes({ content: plainText(words(1)) })).toBe(1);
  });

  it("strips tags from html bodies before counting words", () => {
    expect(service().articleReadMinutes({ content: html(`<p>${words(250)}</p><p>${words(150)}</p>`) })).toBe(2);
  });

  it("does not glue words together across adjacent tags", () => {
    expect(service().articleReadMinutes({ content: html("<p>one</p><p>two three</p>") })).toBe(1);
  });

  it("returns null for pdf content", () => {
    expect(
      service().articleReadMinutes({
        content: { type: "pdf", url: "/uploads/articles/x.pdf", originalName: "x.pdf", mimeType: "application/pdf", size: 123 },
      }),
    ).toBeNull();
  });

  it("returns null for whitespace-only plain text", () => {
    expect(service().articleReadMinutes({ content: plainText("   ") })).toBeNull();
  });

  it("returns null for html with no text content", () => {
    expect(service().articleReadMinutes({ content: html("<p></p>") })).toBeNull();
  });
});
