import { CreateInMemoryOnDraftRepository } from "../../src/repository/InMemoryOnDraftRepository";
import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";
import { CreateOnDraftService, parseYoutubeVideoId } from "../../src/service/OnDraftService";
import { CreateUserPreferenceService } from "../../src/service/UserPreferenceService";
import { IYoutubeVideoStatsService } from "../../src/service/YoutubeVideoStatsService";
import { calculateDraftGrade, defaultDraftGrade, formatDraftBoardGrade, gradeTraitCategoriesForGrade, type DraftGrade } from "../../src/model/DraftGrades";
import type { Position } from "../../src/model/OnDraftContent";

function service() {
  return CreateOnDraftService(CreateInMemoryOnDraftRepository({ seedContent: false }));
}

function serviceWithYoutubeStats(youtubeStats: IYoutubeVideoStatsService) {
  return CreateOnDraftService(CreateInMemoryOnDraftRepository({ seedContent: false }), youtubeStats);
}

function userPreferenceService() {
  return CreateUserPreferenceService(CreateInMemoryUserRepository());
}

function filledGrade(position: Position, score = 6, potential = 6): DraftGrade {
  const base = defaultDraftGrade(position);
  if (!base) {
    throw new Error(`Missing grade config for ${position}`);
  }
  const categories = gradeTraitCategoriesForGrade(base, position);
  return {
    ...base,
    potential,
    physicalTraits: Object.fromEntries(categories[0].traits.map((trait) => [trait, score])),
    filmTraits: Object.fromEntries(categories[1].traits.map((trait) => [trait, score])),
  };
}

describe("Draft grade calculations", () => {
  it("matches Ryan's weighted WR final grade math to two decimals", () => {
    const grade: DraftGrade = {
      position: "WR",
      archetype: "Balanced",
      potential: 6,
      physicalTraits: {
        Speed: 6,
        Acceleration: 6,
        Agility: 7,
        "Change of Direction": 7,
        Strength: 5,
        "Size / Frame": 5,
      },
      filmTraits: {
        "Blocking / Toughness": 4,
        "Route Tree": 7,
        "Short Route Running": 7,
        "Intermediate Route Running": 7,
        "Deep Route Running": 6,
        Release: 7,
        Catching: 6,
        "Catch In Traffic": 6,
        "Contested Catching": 5,
        "Body Control": 7,
        "Run After Catch": 4,
      },
    };

    const result = calculateDraftGrade(grade);

    expect(result).not.toBeNull();
    expect(result?.physicalGrade).toBeCloseTo(6.14, 4);
    expect(result?.filmGrade).toBeCloseTo(6.08, 4);
    expect(formatDraftBoardGrade(result?.displayGrade)).toBe("6.26/8");
  });

  it("maps OnDraft EDGE to Ryan's ED formula and supports NA in calculations", () => {
    const edgeGrade = filledGrade("EDGE", 6, 6);
    edgeGrade.physicalTraits.Speed = "NA";

    const result = calculateDraftGrade(edgeGrade);

    expect(result).not.toBeNull();
    expect(formatDraftBoardGrade(result?.displayGrade)).toBe("6.15/8");
  });

  it("accepts decimal trait grades and keeps displayed grades within the eight point scale", () => {
    const decimalGrade = filledGrade("WR", 6.5, 6);
    const maxGrade = filledGrade("WR", 8, 8);

    expect(formatDraftBoardGrade(calculateDraftGrade(decimalGrade)?.displayGrade)).toBe("6.65/8");
    expect(calculateDraftGrade(maxGrade)?.finalGrade).toBeCloseTo(8.3, 4);
    expect(formatDraftBoardGrade(calculateDraftGrade(maxGrade)?.displayGrade)).toBe("8.00/8");
  });
});

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

  it("rejects banned phrases in non-admin comments and forum posts", async () => {
    const ondraftService = service();
    const created = await ondraftService.createArticle({
      title: "Moderated Discussion",
      author: "Alice OnDraft",
      writeup: "A short moderation summary.",
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

    const comment = await ondraftService.commentByArticleId({
      articleId: created.value.id,
      userId: "reader-1",
      userName: "Reader One",
      text: "This casino angle is not it.",
    });
    expect(comment.ok).toBe(false);
    if (comment.ok === false) {
      expect(comment.value.name).toBe("ArticleValidationError");
      expect(comment.value.message).toContain("contains profanity");
    }

    const forumPost = await ondraftService.createForumPost({
      userId: "reader-1",
      userName: "Reader One",
      content: "The betting odds take is tired.",
    });
    expect(forumPost.ok).toBe(false);
    if (forumPost.ok === false) {
      expect(forumPost.value.name).toBe("ForumPostValidationError");
      expect(forumPost.value.message).toContain("contains profanity");
    }
  });

  it("rejects article and hot take comments over 200 words", async () => {
    const ondraftService = service();
    const tooManyWords = Array.from({ length: 201 }, (_, index) => `word${index}`).join(" ");
    const createdArticle = await ondraftService.createArticle({
      title: "Long Comment Discussion",
      author: "Alice OnDraft",
      writeup: "A short discussion summary.",
      publicationDate: new Date("2024-01-01"),
      content: {
        type: "plainText",
        text: "A regular article body.",
      },
    });
    const createdPost = await ondraftService.createForumPost({
      userId: "reader-1",
      userName: "Reader One",
      content: "A normal hot take.",
    });

    expect(createdArticle.ok).toBe(true);
    expect(createdPost.ok).toBe(true);
    if (createdArticle.ok === false || createdPost.ok === false) {
      return;
    }

    const articleComment = await ondraftService.commentByArticleId({
      articleId: createdArticle.value.id,
      userId: "reader-1",
      userName: "Reader One",
      text: tooManyWords,
    });
    const hotTakeComment = await ondraftService.commentByForumPostId(createdPost.value.id, {
      userId: "reader-1",
      userName: "Reader One",
      text: tooManyWords,
    });

    expect(articleComment.ok).toBe(false);
    expect(hotTakeComment.ok).toBe(false);
    if (articleComment.ok === false) {
      expect(articleComment.value.message).toBe("Comment text cannot be more than 200 words.");
    }
    if (hotTakeComment.ok === false) {
      expect(hotTakeComment.value.message).toBe("Comment text cannot be more than 200 words.");
    }
  });

  it("allows admins to submit text that would otherwise match the banned phrase list", async () => {
    const ondraftService = service();
    const created = await ondraftService.createArticle({
      title: "Admin Moderation",
      author: "Alice OnDraft",
      writeup: "A short admin summary.",
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

    const comment = await ondraftService.commentByArticleId({
      articleId: created.value.id,
      userId: "admin-1",
      userName: "Admin One",
      text: "Moderating a casino keyword here.",
      isAdmin: true,
    });
    expect(comment.ok).toBe(true);

    const forumPost = await ondraftService.createForumPost({
      userId: "admin-1",
      userName: "Admin One",
      content: "Moderating a betting odds keyword here.",
      isAdmin: true,
    });
    expect(forumPost.ok).toBe(true);
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

  it("normalizes unique short tags and rejects writeups over 300 words", async () => {
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
      writeup: Array.from({ length: 301 }, (_, index) => `word${index}`).join(" "),
      publicationDate: new Date("2024-01-01"),
      content: {
        type: "plainText",
        text: "A regular article body.",
      },
    });

    expect(rejected.ok).toBe(false);
    if (rejected.ok === false) {
      expect(rejected.value.message).toContain("Writeup cannot be more than 300 words");
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

  it("generates a consensus board from Ryan and Aleks rankings using Ryan player info as the source of truth", async () => {
    const ondraftService = service();

    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      playerName: "Quarterback Prospect",
      school: "Ryan State",
      position: "QB",
      rank: 1,
      posRank: 1,
      height: { feet: 6, inches: 2 },
      weight: 220,
    });
    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Aleks",
      playerName: "Quarterback Prospect",
      school: "Aleks Tech",
      position: "WR",
      rank: 13,
      posRank: 3,
      height: { feet: 5, inches: 11 },
      weight: 185,
    });
    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      playerName: "Edge Prospect",
      school: "OnDraft State",
      position: "EDGE",
      rank: 4,
      posRank: 1,
      height: { feet: 6, inches: 4 },
      weight: 255,
    });
    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Aleks",
      playerName: "Edge Prospect",
      school: "OnDraft State",
      position: "EDGE",
      rank: 6,
      posRank: 2,
      height: { feet: 6, inches: 4 },
      weight: 255,
    });
    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      playerName: "Tackle Prospect",
      school: "Published U",
      position: "OT",
      rank: 10,
      posRank: 2,
      height: { feet: 6, inches: 6 },
      weight: 315,
    });
    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Aleks",
      playerName: "Tackle Prospect",
      school: "Private U",
      position: "IOL",
      rank: 30,
      posRank: 8,
      height: { feet: 6, inches: 3 },
      weight: 295,
      playerInfoPublished: false,
    });

    const consensus = await ondraftService.getBigBoard(2026, "Consensus");

    expect(consensus.ok).toBe(true);
    if (consensus.ok === true) {
      expect(consensus.value.entries.map((entry) => entry.playerName)).toEqual([
        "Edge Prospect",
        "Quarterback Prospect",
        "Tackle Prospect",
      ]);

      const quarterback = consensus.value.entries.find((entry) => entry.playerName === "Quarterback Prospect");
      expect(quarterback).toMatchObject({
        school: "Ryan State",
        position: "QB",
        rank: 2,
        posRank: 1,
        height: { feet: 6, inches: 2 },
        weight: 220,
        bigDiscrepency: true,
      });

      const edge = consensus.value.entries.find((entry) => entry.playerName === "Edge Prospect");
      expect(edge).toMatchObject({
        rank: 1,
        posRank: 1,
        bigDiscrepency: false,
      });

      const tackle = consensus.value.entries.find((entry) => entry.playerName === "Tackle Prospect");
      expect(tackle).toMatchObject({
        school: "Published U",
        position: "OT",
        rank: 3,
        posRank: 1,
        bigDiscrepency: false,
      });
    }
  });

  it("assigns sequential consensus ranks and uses Ryan rankings to break average ties", async () => {
    const ondraftService = service();

    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      playerName: "Player One",
      school: "Ryan State",
      position: "QB",
      rank: 1,
      posRank: 1,
      height: { feet: 6, inches: 2 },
      weight: 220,
    });
    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Aleks",
      playerName: "Player One",
      school: "Aleks Tech",
      position: "QB",
      rank: 3,
      posRank: 3,
      height: { feet: 6, inches: 1 },
      weight: 215,
    });
    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      playerName: "Player Two",
      school: "Ryan State",
      position: "QB",
      rank: 2,
      posRank: 2,
      height: { feet: 6, inches: 0 },
      weight: 210,
    });
    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      playerName: "Receiver One",
      school: "Ryan State",
      position: "WR",
      rank: 3,
      posRank: 1,
      height: { feet: 6, inches: 1 },
      weight: 200,
    });

    const consensus = await ondraftService.getBigBoard(2026, "Consensus");

    expect(consensus.ok).toBe(true);
    if (consensus.ok === true) {
      expect(consensus.value.entries.map((entry) => ({
        playerName: entry.playerName,
        rank: entry.rank,
        posRank: entry.posRank,
      }))).toEqual([
        { playerName: "Player One", rank: 1, posRank: 1 },
        { playerName: "Player Two", rank: 2, posRank: 2 },
        { playerName: "Receiver One", rank: 3, posRank: 1 },
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

  it("saves one big board entry without replacing the rest of the board", async () => {
    const ondraftService = service();

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        {
          id: "targeted-entry-one",
          playerName: "Targeted One",
          school: "OnDraft State",
          position: "QB",
          rank: 1,
          posRank: 1,
          height: { feet: 6, inches: 2 },
          weight: 220,
        },
        {
          id: "targeted-entry-two",
          playerName: "Targeted Two",
          school: "Mock Tech",
          position: "WR",
          rank: 2,
          posRank: 1,
          height: { feet: 6, inches: 0 },
          weight: 195,
        },
      ],
    });
    expect(saved.ok).toBe(true);

    const updated = await ondraftService.saveBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      entry: {
        id: "targeted-entry-one",
        playerName: "Targeted One Updated",
        school: "OnDraft State",
        position: "QB",
        rank: 1,
        posRank: 1,
        height: { feet: 6, inches: 2 },
        weight: 221,
      },
    });
    expect(updated.ok).toBe(true);

    const board = await ondraftService.getBigBoard(2026, "Ryan");
    expect(board.ok).toBe(true);
    if (board.ok === true) {
      expect(board.value.entries.map((entry) => entry.playerName)).toEqual([
        "Targeted One Updated",
        "Targeted Two",
      ]);
      expect(board.value.entries[0].weight).toBe(221);
    }
  });

  it("saves draft grades and only publishes fully numeric grade entries", async () => {
    const ondraftService = service();
    const invalidGrade = filledGrade("EDGE", 6, 6);
    invalidGrade.physicalTraits.Speed = "NA";

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        {
          id: "edge-grade-draft",
          playerName: "Graded Edge",
          school: "OnDraft State",
          position: "EDGE",
          rank: 1,
          posRank: 1,
          height: { feet: 6, inches: 4 },
          weight: 255,
          grade: invalidGrade,
        },
      ],
    });

    expect(saved.ok).toBe(true);
    if (saved.ok === false) {
      return;
    }
    expect(saved.value.entries[0].gradePublished).toBe(false);

    const rejected = await ondraftService.publishBigBoardEntryGrade(2026, "Ryan", "edge-grade-draft");
    expect(rejected.ok).toBe(false);
    if (rejected.ok === false) {
      expect(rejected.value.message).toContain("Speed must be a number from 1 to 8");
    }

    const validGrade = filledGrade("EDGE", 6, 6);
    const corrected = await ondraftService.saveBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      entry: {
        ...saved.value.entries[0],
        grade: validGrade,
        gradePublished: false,
      },
    });
    expect(corrected.ok).toBe(true);

    const published = await ondraftService.publishBigBoardEntryGrade(2026, "Ryan", "edge-grade-draft");
    expect(published.ok).toBe(true);
    if (published.ok === true) {
      expect(published.value.gradePublished).toBe(true);
      expect(formatDraftBoardGrade(calculateDraftGrade(published.value.grade)?.displayGrade)).toBe("6.15/8");
    }
  });

  it("preserves omitted writeup and grade data when saving a single draft board card", async () => {
    const ondraftService = service();
    const grade = filledGrade("WR", 6.5, 6);
    const created = await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      id: "partial-save-preserves-nested",
      playerName: "Partial Save",
      school: "OnDraft State",
      position: "WR",
      rank: 1,
      posRank: 1,
      height: { feet: 6, inches: 1 },
      weight: 205,
      grade,
      gradePublished: true,
      strengths: "Original strength.",
      weaknesses: "Original weakness.",
      rundown: "Original rundown.",
      writeupPublished: true,
    });
    expect(created.ok).toBe(true);

    const saved = await ondraftService.saveBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      entry: {
        id: "partial-save-preserves-nested",
        playerName: "Partial Save Updated",
        school: "OnDraft State",
        position: "WR",
        rank: 1,
        posRank: 1,
        height: { feet: 6, inches: 1 },
        weight: 206,
      },
    });

    expect(saved.ok).toBe(true);
    if (saved.ok === true) {
      expect(saved.value.writeup).toEqual({
        strengths: "Original strength.",
        weaknesses: "Original weakness.",
        rundown: "Original rundown.",
      });
      expect(saved.value.writeupPublished).toBe(true);
      expect(saved.value.gradePublished).toBe(true);
      expect(formatDraftBoardGrade(calculateDraftGrade(saved.value.grade)?.displayGrade)).toBe("6.65/8");
    }
  });

  it("averages published board grades on the consensus board", async () => {
    const ondraftService = service();

    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      playerName: "Consensus Grade",
      school: "OnDraft State",
      position: "WR",
      rank: 1,
      posRank: 1,
      height: { feet: 6, inches: 1 },
      weight: 205,
      grade: filledGrade("WR", 6, 6),
      gradePublished: true,
    });
    await ondraftService.createBigBoardEntry({
      year: 2026,
      creator: "Aleks",
      playerName: "Consensus Grade",
      school: "OnDraft State",
      position: "WR",
      rank: 3,
      posRank: 1,
      height: { feet: 6, inches: 1 },
      weight: 205,
      grade: filledGrade("WR", 8, 8),
      gradePublished: true,
    });

    const consensus = await ondraftService.getBigBoard(2026, "Consensus");

    expect(consensus.ok).toBe(true);
    if (consensus.ok === true) {
      expect(consensus.value.entries[0].gradePublished).toBe(true);
      expect(formatDraftBoardGrade(consensus.value.entries[0].gradeSummary?.finalGrade)).toBe("7.08/8");
    }
  });
});

describe("UserPreferenceService bookmarks", () => {
  it("toggles article and forum post bookmarks for a user", async () => {
    const preferences = userPreferenceService();

    const articleOn = await preferences.toggleBookmark("user-support", { type: "article", articleId: "article-1" });
    const forumPostOn = await preferences.toggleBookmark("user-support", { type: "forumPost", forumPostId: "post-1" });

    expect(articleOn).toEqual({ ok: true, value: true });
    expect(forumPostOn).toEqual({ ok: true, value: true });

    const bookmarks = await preferences.getUserBookmarks("user-support");
    expect(bookmarks.ok).toBe(true);
    if (bookmarks.ok === true) {
      expect(bookmarks.value).toEqual([
        { type: "article", articleId: "article-1" },
        { type: "forumPost", forumPostId: "post-1" },
      ]);
    }

    const articleOff = await preferences.toggleBookmark("user-support", { type: "article", articleId: "article-1" });
    expect(articleOff).toEqual({ ok: true, value: false });

    const updated = await preferences.getUserBookmarks("user-support");
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
    let quarterbackViewCount = 25;
    const statsService: IYoutubeVideoStatsService = {
      async fetchVideoStats(videoIds) {
        return {
          ok: true,
          value: new Map(videoIds.map((videoId) => [videoId, {
            videoId,
            thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            viewCount: videoId === "dQw4w9WgXcQ" ? quarterbackViewCount : 10,
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

    const videoTags = await ondraftService.getVideoTags();
    expect(videoTags.ok).toBe(true);
    if (videoTags.ok === true) {
      expect(videoTags.value).toEqual(["film-room", "qb", "wr"]);
    }

    const excludedByDate = await ondraftService.filterYoutubeVideos({
      dateRange: { from: new Date("2000-01-01T00:00:00.000Z"), to: new Date("2000-01-02T00:00:00.000Z") },
    });
    expect(excludedByDate.ok).toBe(true);
    if (excludedByDate.ok === true) {
      expect(excludedByDate.value).toEqual([]);
    }

    const popularity = await ondraftService.filterYoutubeVideos({ sortBy: "popularity", sortDirection: "desc" });
    expect(popularity.ok).toBe(true);
    if (popularity.ok === true) {
      expect(popularity.value.map((video) => video.title)).toEqual(["Quarterback Film", "Receiver Notes"]);
    }

    quarterbackViewCount = 99;
    const updated = await ondraftService.updateYoutubeVideo("dQw4w9WgXcQ", {
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Quarterback Film Updated",
      description: "Updated QB processing.",
      tags: ["Film Room", "QB"],
    });

    expect(updated.ok).toBe(true);
    if (updated.ok === true) {
      expect(updated.value.title).toBe("Quarterback Film Updated");
      expect(updated.value.thumbnailUrl).toContain("maxresdefault");
      expect(updated.value.viewCount).toBe(99);
    }
  });

  it("refreshes stale cached youtube stats across the whole catalog", async () => {
    let currentViewCount = 25;
    const statsService: IYoutubeVideoStatsService = {
      async fetchVideoStats(videoIds) {
        return {
          ok: true,
          value: new Map(videoIds.map((videoId) => [videoId, {
            videoId,
            thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            viewCount: currentViewCount,
          }])),
        };
      },
    };
    const ondraftService = serviceWithYoutubeStats(statsService);

    const created = await ondraftService.createYoutubeVideo({
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Quarterback Film",
      description: "A look at QB processing.",
      tags: ["Film Room", "QB"],
    });

    expect(created.ok).toBe(true);
    if (created.ok === false) {
      return;
    }

    currentViewCount = 99;
    const staleWrite = await ondraftService.updateYoutubeVideoStats("dQw4w9WgXcQ", {
      thumbnailUrl: created.value.thumbnailUrl,
      viewCount: 25,
      youtubeStatsFetchedAt: new Date(Date.now() - (25 * 60 * 60 * 1000)),
    });
    expect(staleWrite.ok).toBe(true);

    const refreshed = await ondraftService.refreshYoutubeVideoCatalog();
    expect(refreshed).toEqual({ ok: true, value: 1 });

    const video = await ondraftService.getYoutubeVideo("dQw4w9WgXcQ");
    expect(video.ok).toBe(true);
    if (video.ok === true) {
      expect(video.value.viewCount).toBe(99);
    }
  });

  it("returns cached youtube stats immediately while refreshing stale data in the background", async () => {
    let fetchCount = 0;
    let releaseBackgroundRefresh: (() => void) | null = null;
    let backgroundRefreshStartedResolve: (() => void) | null = null;
    const backgroundRefreshStarted = new Promise<void>((resolve) => {
      backgroundRefreshStartedResolve = resolve;
    });

    const statsService: IYoutubeVideoStatsService = {
      async fetchVideoStats(videoIds) {
        fetchCount += 1;
        if (fetchCount === 1) {
          return {
            ok: true,
            value: new Map(videoIds.map((videoId) => [videoId, {
              videoId,
              thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
              viewCount: 25,
            }])),
          };
        }

        backgroundRefreshStartedResolve?.();
        return await new Promise((resolve) => {
          releaseBackgroundRefresh = () => resolve({
            ok: true,
            value: new Map(videoIds.map((videoId) => [videoId, {
              videoId,
              thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
              viewCount: 99,
            }])),
          });
        });
      },
    };
    const ondraftService = serviceWithYoutubeStats(statsService);

    const created = await ondraftService.createYoutubeVideo({
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Quarterback Film",
      description: "A look at QB processing.",
      tags: ["Film Room", "QB"],
    });
    expect(created.ok).toBe(true);
    if (created.ok === false) {
      return;
    }

    const staleWrite = await ondraftService.updateYoutubeVideoStats("dQw4w9WgXcQ", {
      thumbnailUrl: created.value.thumbnailUrl,
      viewCount: 25,
      youtubeStatsFetchedAt: new Date(Date.now() - (25 * 60 * 60 * 1000)),
    });
    expect(staleWrite.ok).toBe(true);

    const listed = await ondraftService.getYoutubeVideos();
    expect(listed.ok).toBe(true);
    if (listed.ok === true) {
      expect(listed.value[0].viewCount).toBe(25);
    }

    await backgroundRefreshStarted;

    const stillCached = await ondraftService.getYoutubeVideo("dQw4w9WgXcQ");
    expect(stillCached.ok).toBe(true);
    if (stillCached.ok === true) {
      expect(stillCached.value.viewCount).toBe(25);
    }

    releaseBackgroundRefresh?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const refreshed = await ondraftService.getYoutubeVideo("dQw4w9WgXcQ");
    expect(refreshed.ok).toBe(true);
    if (refreshed.ok === true) {
      expect(refreshed.value.viewCount).toBe(99);
    }
  });
});
