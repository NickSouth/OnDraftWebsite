import { CreateInMemoryOnDraftRepository } from "../../src/repository/InMemoryOnDraftRepository";
import { CreateOnDraftService } from "../../src/service/OnDraftService";

function service() {
  return CreateOnDraftService(CreateInMemoryOnDraftRepository());
}

describe("OnDraftService article validation", () => {
  it("generates a five character alphanumeric article id", async () => {
    const result = await service().createArticle({
      title: "Draft Notes",
      author: "Alice OnDraft",
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

  it("assigns a default football thumbnail when no article image is provided", async () => {
    const result = await service().createArticle({
      title: "Default Image Notes",
      author: "Alice OnDraft",
      writeup: "A short default image summary.",
      publicationDate: new Date("2024-01-01"),
      content: {
        type: "plainText",
        text: "A regular article body.",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.imageUrl).toMatch(/^\/images\/article-defaults\/(football|helmet|uprights)\.png$/);
    }
  });

  it("keeps draft articles out of the published article list", async () => {
    const ondraftService = service();
    const draft = await ondraftService.createArticle({
      title: "Draft Notes",
      author: "Alice OnDraft",
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

    const publishedArticles = await ondraftService.getArticles();
    const draftArticles = await ondraftService.getArticles(false);

    expect(publishedArticles.ok).toBe(true);
    expect(draftArticles.ok).toBe(true);
    if (publishedArticles.ok === true && draftArticles.ok === true) {
      expect(publishedArticles.value).toHaveLength(0);
      expect(draftArticles.value).toHaveLength(1);
      expect(draftArticles.value[0].title).toBe("Draft Notes");
    }
  });

  it("adds comments, likes articles, likes comments, and deletes comments", async () => {
    const ondraftService = service();
    const created = await ondraftService.createArticle({
      title: "Discussion Notes",
      author: "Alice OnDraft",
      writeup: "A short discussion summary.",
      publicationDate: new Date("2024-01-01"),
      content: {
        type: "plainText",
        text: "A regular article body.",
      },
    });

    expect(created.ok).toBe(true);
    if (created.ok === false) {
      return;
    }

    const likedArticle = await ondraftService.likeByArticleId(created.value.id, "reader-1");
    expect(likedArticle.ok).toBe(true);
    if (likedArticle.ok === true) {
      expect(likedArticle.value.likes).toBe(1);
    }

    const unlikedArticle = await ondraftService.likeByArticleId(created.value.id, "reader-1");
    expect(unlikedArticle.ok).toBe(true);
    if (unlikedArticle.ok === true) {
      expect(unlikedArticle.value.likes).toBe(0);
    }

    const comment = await ondraftService.commentByArticleId({
      articleId: created.value.id,
      userId: "reader-1",
      userName: "Reader One",
      text: "Good read.",
    });

    expect(comment.ok).toBe(true);
    if (comment.ok === false) {
      return;
    }
    expect(comment.value.id).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(comment.value.likes).toBe(0);

    const likedComment = await ondraftService.likeByCommentId(comment.value.id, "reader-1");
    expect(likedComment.ok).toBe(true);
    if (likedComment.ok === true) {
      expect(likedComment.value.likes).toBe(1);
    }

    const unlikedComment = await ondraftService.likeByCommentId(comment.value.id, "reader-1");
    expect(unlikedComment.ok).toBe(true);
    if (unlikedComment.ok === true) {
      expect(unlikedComment.value.likes).toBe(0);
    }

    const deleted = await ondraftService.deleteComment(comment.value.id);
    expect(deleted.ok).toBe(true);

    const deletedAgain = await ondraftService.deleteComment(comment.value.id);
    expect(deletedAgain.ok).toBe(false);
    if (deletedAgain.ok === false) {
      expect(deletedAgain.value.name).toBe("CommentNotFound");
    }
  });

  it("rejects empty plain text article content", async () => {
    const result = await service().createArticle({
      title: "Draft Notes",
      author: "Alice OnDraft",
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
      author: "Alice OnDraft",
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
      author: "Alice OnDraft",
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
      author: "Alice OnDraft",
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
      author: "Alice OnDraft",
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

describe("OnDraftService big board editing", () => {
  it("saves blank draft rows without publishing them", async () => {
    const ondraftService = service();

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [{}],
    });

    expect(saved.ok).toBe(true);
    if (saved.ok === true) {
      expect(saved.value.entries).toHaveLength(1);
      expect(saved.value.entries[0].playerInfoPublished).toBe(false);
      expect(saved.value.entries[0].writeupPublished).toBe(false);
    }
  });

  it("publishes player info only after canonical position and rank validation passes", async () => {
    const ondraftService = service();

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        {
          playerName: "Edge Prospect",
          school: "OnDraft State",
          position: "DE",
          rank: 1,
          posRank: 1,
          height: { feet: 6, inches: 4 },
          weight: 260,
        },
      ],
    });

    expect(saved.ok).toBe(true);
    if (saved.ok === false) {
      return;
    }

    const rejected = await ondraftService.publishBigBoardEntryPlayerInfo(2026, "Ryan", saved.value.entries[0].id);
    expect(rejected.ok).toBe(false);
    if (rejected.ok === false) {
      expect(rejected.value.message).toContain("Player name, school, position, height, weight, rank, and position rank are required");
    }

    const corrected = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        {
          ...saved.value.entries[0],
          position: "EDGE",
        },
      ],
    });
    expect(corrected.ok).toBe(true);
    if (corrected.ok === false) {
      return;
    }

    const published = await ondraftService.publishBigBoardEntryPlayerInfo(2026, "Ryan", corrected.value.entries[0].id);
    expect(published.ok).toBe(true);
    if (published.ok === true) {
      expect(published.value.playerInfoPublished).toBe(true);
    }
  });

  it("rejects duplicate published overall ranks and same-position position ranks", async () => {
    const ondraftService = service();

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        {
          playerName: "Quarterback One",
          school: "OnDraft",
          position: "QB",
          rank: 1,
          posRank: 1,
          height: { feet: 6, inches: 2 },
          weight: 220,
        },
        {
          playerName: "Quarterback Two",
          school: "OnDraft",
          position: "QB",
          rank: 1,
          posRank: 1,
          height: { feet: 6, inches: 3 },
          weight: 225,
        },
      ],
    });

    expect(saved.ok).toBe(true);
    if (saved.ok === false) {
      return;
    }

    const first = await ondraftService.publishBigBoardEntryPlayerInfo(2026, "Ryan", saved.value.entries[0].id);
    expect(first.ok).toBe(true);

    const second = await ondraftService.publishBigBoardEntryPlayerInfo(2026, "Ryan", saved.value.entries[1].id);
    expect(second.ok).toBe(false);
    if (second.ok === false) {
      expect(second.value.message).toContain("Overall rank 1 is already used");
    }
  });

  it("unpublishes only the edited section of a saved row", async () => {
    const ondraftService = service();
    const created = await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      playerName: "Published Player",
      school: "OnDraft",
      position: "WR",
      rank: 3,
      posRank: 1,
      height: { feet: 6, inches: 1 },
      weight: 205,
      strengths: "Separation",
      weaknesses: "Play strength",
      rundown: "Ready to contribute early.",
      writeupPublished: true,
    });

    expect(created.ok).toBe(true);
    if (created.ok === false) {
      return;
    }

    const changedSchool = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        {
          ...created.value,
          school: "Updated OnDraft",
        },
      ],
    });

    expect(changedSchool.ok).toBe(true);
    if (changedSchool.ok === true) {
      expect(changedSchool.value.entries[0].playerInfoPublished).toBe(false);
      expect(changedSchool.value.entries[0].writeupPublished).toBe(true);
    }

    const republished = await ondraftService.publishBigBoardEntryPlayerInfo(2026, "Ryan", created.value.id);
    expect(republished.ok).toBe(true);

    const changedWriteup = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        {
          ...created.value,
          school: "Updated OnDraft",
          writeup: {
            ...created.value.writeup,
            rundown: "Updated rundown.",
          },
        },
      ],
    });

    expect(changedWriteup.ok).toBe(true);
    if (changedWriteup.ok === true) {
      expect(changedWriteup.value.entries[0].playerInfoPublished).toBe(true);
      expect(changedWriteup.value.entries[0].writeupPublished).toBe(false);
    }
  });
});
