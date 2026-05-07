import { CreateInMemoryOnDraftRepository } from "../../src/repository/InMemoryOnDraftRepository";
import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";
import { CreateOnDraftService, parseYoutubeVideoId } from "../../src/service/OnDraftService";
import { CreateUserPreferenceService } from "../../src/service/UserPreferenceService";
import { IYoutubeVideoStatsService } from "../../src/service/YoutubeVideoStatsService";

function service() {
  return CreateOnDraftService(CreateInMemoryOnDraftRepository());
}

function serviceWithYoutubeStats(youtubeStats: IYoutubeVideoStatsService) {
  return CreateOnDraftService(CreateInMemoryOnDraftRepository(), youtubeStats);
}

function userPreferenceService() {
  return CreateUserPreferenceService(CreateInMemoryUserRepository());
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
  it("filters big board entries by position and school without mutating the saved board", async () => {
    const ondraftService = service();

    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      playerName: "Quarterback Prospect",
      school: "OnDraft State",
      position: "QB",
      rank: 1,
      posRank: 1,
      height: { feet: 6, inches: 2 },
      weight: 220,
    });
    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      playerName: "Receiver Prospect",
      school: "Mock Tech",
      position: "WR",
      rank: 2,
      posRank: 1,
      height: { feet: 6, inches: 1 },
      weight: 205,
    });

    const filtered = await ondraftService.getBigBoard(2026, "Ryan", { position: "QB", school: "OnDraft State" });
    expect(filtered.ok).toBe(true);
    if (filtered.ok === true) {
      expect(filtered.value.entries.map((entry) => entry.playerName)).toEqual(["Quarterback Prospect"]);
    }

    const unfiltered = await ondraftService.getBigBoard(2026, "Ryan");
    expect(unfiltered.ok).toBe(true);
    if (unfiltered.ok === true) {
      expect(unfiltered.value.entries.map((entry) => entry.playerName)).toEqual([
        "Quarterback Prospect",
        "Receiver Prospect",
      ]);
    }
  });

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

  it("saves independent publication checkbox state for each section", async () => {
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
          playerInfoPublished: false,
          writeupPublished: true,
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
          playerInfoPublished: true,
          writeupPublished: false,
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

describe("UserPreferenceService bookmarks", () => {
  it("toggles article and forum post bookmarks for a user", async () => {
    const preferences = userPreferenceService();

    const articleOn = await preferences.toggleBookmark("user-bob", { type: "article", articleId: "article-1" });
    const forumPostOn = await preferences.toggleBookmark("user-bob", { type: "forumPost", forumPostId: "post-1" });

    expect(articleOn).toEqual({ ok: true, value: true });
    expect(forumPostOn).toEqual({ ok: true, value: true });

    const bookmarks = await preferences.getUserBookmarks("user-bob");
    expect(bookmarks.ok).toBe(true);
    if (bookmarks.ok === true) {
      expect(bookmarks.value).toEqual([
        { type: "article", articleId: "article-1" },
        { type: "forumPost", forumPostId: "post-1" },
      ]);
    }

    const articleOff = await preferences.toggleBookmark("user-bob", { type: "article", articleId: "article-1" });
    expect(articleOff).toEqual({ ok: true, value: false });

    const updated = await preferences.getUserBookmarks("user-bob");
    expect(updated.ok).toBe(true);
    if (updated.ok === true) {
      expect(updated.value).toEqual([{ type: "forumPost", forumPostId: "post-1" }]);
    }
  });
});

describe("OnDraftService YouTube videos", () => {
  it("parses normal and short YouTube URLs and rejects invalid links", () => {
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ ok: true, value: "dQw4w9WgXcQ" });
    expect(parseYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=42")).toEqual({ ok: true, value: "dQw4w9WgXcQ" });

    const invalid = parseYoutubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ");
    expect(invalid.ok).toBe(false);
    if (invalid.ok === false) {
      expect(invalid.value.name).toBe("ArticleValidationError");
    }
  });

  it("creates videos, refreshes cached stats, and filters by keyword and tags", async () => {
    const statsService: IYoutubeVideoStatsService = {
      async fetchVideoStats(videoIds) {
        return {
          ok: true,
          value: new Map(videoIds.map((videoId) => [videoId, {
            videoId,
            thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            viewCount: videoId === "dQw4w9WgXcQ" ? 25 : 10,
          }])),
        };
      },
    };
    const ondraftService = serviceWithYoutubeStats(statsService);

    const first = await ondraftService.createYoutubeVideo({
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Quarterback Film",
      description: "A look at QB processing.",
      tags: ["Film Room", "QB"],
    });
    const second = await ondraftService.createYoutubeVideo({
      youtubeUrl: "https://youtu.be/oHg5SJYRHA0",
      title: "Receiver Notes",
      description: "A look at releases.",
      tags: ["Film Room", "WR"],
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const filtered = await ondraftService.filterYoutubeVideos({ keyword: "quarterback", tags: ["film-room"] });
    expect(filtered.ok).toBe(true);
    if (filtered.ok === true) {
      expect(filtered.value.map((video) => video.title)).toEqual(["Quarterback Film"]);
      expect(filtered.value[0].thumbnailUrl).toContain("maxresdefault");
      expect(filtered.value[0].viewCount).toBe(25);
    }

    const popularity = await ondraftService.filterYoutubeVideos({ sortBy: "popularity", sortDirection: "desc" });
    expect(popularity.ok).toBe(true);
    if (popularity.ok === true) {
      expect(popularity.value.map((video) => video.title)).toEqual(["Quarterback Film", "Receiver Notes"]);
    }
  });
});
