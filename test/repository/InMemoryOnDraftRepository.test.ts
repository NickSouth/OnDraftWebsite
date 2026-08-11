import { CreateInMemoryOnDraftRepository } from "../../src/repository/InMemoryOnDraftRepository";

describe("InMemoryOnDraftRepository", () => {
  const originalLoadTestFlag = process.env.ONDRAFT_MEMORY_LOAD_TEST;

  afterEach(() => {
    if (originalLoadTestFlag === undefined) {
      delete process.env.ONDRAFT_MEMORY_LOAD_TEST;
      return;
    }
    process.env.ONDRAFT_MEMORY_LOAD_TEST = originalLoadTestFlag;
  });

  it("can hard-code 50 load-test entries into the local memory draft boards", async () => {
    process.env.ONDRAFT_MEMORY_LOAD_TEST = "true";
    const repository = CreateInMemoryOnDraftRepository();
    const year = new Date().getFullYear();

    const ryan = await repository.getBigBoard(year, "Ryan");
    const aleks = await repository.getBigBoard(year, "Aleks");
    const consensus = await repository.getBigBoard(year, "Consensus");

    expect(ryan.ok && ryan.value.entries).toHaveLength(50);
    expect(aleks.ok && aleks.value.entries).toHaveLength(50);
    expect(consensus.ok && consensus.value.entries).toHaveLength(50);
  });

  describe("v2.1 search", () => {
    it("matches articles by title, author, and body case-insensitively", async () => {
      const repository = CreateInMemoryOnDraftRepository();

      const byTitle = await repository.searchArticles("QUARTERBACK", 10);
      expect(byTitle.ok).toBe(true);
      if (byTitle.ok === true) {
        expect(byTitle.value.map((article) => article.id)).toContain("A1002");
      }

      const byBody = await repository.searchArticles("third-and-medium strips away", 10);
      expect(byBody.ok).toBe(true);
      if (byBody.ok === true) {
        expect(byBody.value.map((article) => article.id)).toContain("A1002");
      }
    });

    it("respects the article limit and matches by author", async () => {
      const repository = CreateInMemoryOnDraftRepository();

      const all = await repository.searchArticles("ryan mcwalter", 10);
      expect(all.ok).toBe(true);
      if (all.ok === true) {
        expect(all.value.length).toBeGreaterThan(1);
      }

      const limited = await repository.searchArticles("ryan mcwalter", 1);
      expect(limited.ok).toBe(true);
      if (limited.ok === true) {
        expect(limited.value).toHaveLength(1);
      }
    });

    it("returns only published articles", async () => {
      const repository = CreateInMemoryOnDraftRepository();
      await repository.createArticle({
        id: "A9999",
        published: false,
        title: "Unpublished quarterback deep dive",
        author: "Ryan McWalter",
        writeup: "Hidden draft.",
        publicationDate: new Date(),
        content: { type: "plainText", text: "Draft body." },
        comments: [],
        likes: 0,
        likedByUserIds: [],
      });

      const results = await repository.searchArticles("quarterback", 10);
      expect(results.ok).toBe(true);
      if (results.ok === true) {
        expect(results.value.map((article) => article.id)).not.toContain("A9999");
      }
    });

    it("matches videos by title", async () => {
      const repository = CreateInMemoryOnDraftRepository();

      const results = await repository.searchYoutubeVideos("pressure", 10);
      expect(results.ok).toBe(true);
      if (results.ok === true) {
        expect(results.value.map((video) => video.title)).toContain("Building pressure without panic: edge and interior notes");
      }
    });

    it("matches forum posts by content", async () => {
      const repository = CreateInMemoryOnDraftRepository();

      const results = await repository.searchForumPosts("pressure answers", 10);
      expect(results.ok).toBe(true);
      if (results.ok === true) {
        expect(results.value.map((post) => post.id)).toContain("post-3");
      }
    });

    it("dedupes big-board player hits across the Ryan and Aleks boards", async () => {
      const repository = CreateInMemoryOnDraftRepository({ seedContent: false, seedLoadTestBigBoards: true });

      const results = await repository.searchBigBoardPlayers("load test player", 100);
      expect(results.ok).toBe(true);
      if (results.ok === true) {
        expect(results.value).toHaveLength(50);
        const keys = results.value.map((hit) => `${hit.year}:${hit.playerName.toLowerCase()}`);
        expect(new Set(keys).size).toBe(keys.length);
      }
    });

    it("matches big-board players by school and by position", async () => {
      const repository = CreateInMemoryOnDraftRepository({ seedContent: false, seedLoadTestBigBoards: true });

      const bySchool = await repository.searchBigBoardPlayers("Alabama", 10);
      expect(bySchool.ok).toBe(true);
      if (bySchool.ok === true) {
        expect(bySchool.value).toHaveLength(1);
        expect(bySchool.value[0].school).toBe("Alabama");
      }

      const byPosition = await repository.searchBigBoardPlayers("QB", 10);
      expect(byPosition.ok).toBe(true);
      if (byPosition.ok === true) {
        expect(byPosition.value.length).toBeGreaterThan(0);
        expect(byPosition.value.every((hit) => hit.position === "QB")).toBe(true);
      }
    });

    it("excludes unpublished big-board players and respects the limit", async () => {
      const repository = CreateInMemoryOnDraftRepository({ seedContent: false, seedLoadTestBigBoards: true });
      const year = new Date().getFullYear();
      await repository.createBigBoardEntry(year, "Ryan", {
        id: "unpublished-load-test",
        playerName: "Load Test Player Hidden",
        position: "QB",
        school: "Nowhere State",
        rank: null,
        posRank: null,
        height: null,
        weight: null,
        playerInfoPublished: false,
        grade: null,
        gradePublished: false,
        writeup: { strengths: "", weaknesses: "", rundown: "" },
        writeupPublished: false,
        notes: "",
      });

      const results = await repository.searchBigBoardPlayers("load test player", 100);
      expect(results.ok).toBe(true);
      if (results.ok === true) {
        expect(results.value.map((hit) => hit.playerName)).not.toContain("Load Test Player Hidden");
      }

      const limited = await repository.searchBigBoardPlayers("load test player", 5);
      expect(limited.ok).toBe(true);
      if (limited.ok === true) {
        expect(limited.value).toHaveLength(5);
      }
    });
  });
});

describe("hero stat counts", () => {
  const currentYear = new Date().getFullYear();

  function bigBoardEntry(id: string, playerName: string) {
    return {
      id,
      playerName,
      position: "QB" as const,
      school: "Load Test University",
      rank: 1,
      posRank: 1,
      height: { feet: 6, inches: 2 },
      weight: 220,
      playerInfoPublished: false,
      grade: null,
      gradePublished: false,
      writeup: { strengths: "", weaknesses: "", rundown: "" },
      writeupPublished: false,
      notes: "",
    };
  }

  function article(id: string, published: boolean) {
    return {
      id,
      published,
      title: `Article ${id}`,
      author: "Ryan McWalter",
      writeup: "A short summary of the article for testing.",
      tags: [],
      publicationDate: new Date("2026-01-01"),
      content: { type: "plainText" as const, text: "Body text." },
      comments: [],
      likes: 0,
      likedByUserIds: [],
    };
  }

  function forumPost(id: string) {
    return {
      id,
      userId: "u1",
      userName: "Fan",
      content: "A hot take.",
      createdAt: new Date("2026-01-01"),
      likes: 0,
      likedByUserIds: [],
      comments: [],
    };
  }

  it("returns zero counts on an empty repository", async () => {
    const repository = CreateInMemoryOnDraftRepository({ seedContent: false });

    const players = await repository.countDistinctBigBoardPlayers();
    const articles = await repository.countPublishedArticles();
    const posts = await repository.countForumPosts();

    expect(players.ok && players.value).toBe(0);
    expect(articles.ok && articles.value).toBe(0);
    expect(posts.ok && posts.value).toBe(0);
  });

  it("dedupes the same player name across years and creators", async () => {
    const repository = CreateInMemoryOnDraftRepository({ seedContent: false });
    await repository.createBigBoardYear(2027);

    await repository.createBigBoardEntry(currentYear, "Ryan", bigBoardEntry("entry-1", "Repeat Prospect"));
    await repository.createBigBoardEntry(2027, "Ryan", bigBoardEntry("entry-2", "Repeat Prospect"));
    await repository.createBigBoardEntry(currentYear, "Aleks", bigBoardEntry("entry-3", "Only Once"));

    const players = await repository.countDistinctBigBoardPlayers();

    expect(players.ok && players.value).toBe(2);
  });

  it("counts only published articles", async () => {
    const repository = CreateInMemoryOnDraftRepository({ seedContent: false });

    await repository.createArticle(article("article-1", true));
    await repository.createArticle(article("article-2", false));

    const articles = await repository.countPublishedArticles();

    expect(articles.ok && articles.value).toBe(1);
  });

  it("counts all forum posts", async () => {
    const repository = CreateInMemoryOnDraftRepository({ seedContent: false });

    await repository.createForumPost(forumPost("post-1"));
    await repository.createForumPost(forumPost("post-2"));

    const posts = await repository.countForumPosts();

    expect(posts.ok && posts.value).toBe(2);
  });
});
