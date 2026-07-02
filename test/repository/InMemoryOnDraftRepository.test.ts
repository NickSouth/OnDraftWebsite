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
