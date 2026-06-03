import { Err, Ok, Result } from "../lib/result";
import { Article, ArticleFilter, BIG_BOARD_CREATORS, BigBoard, BigBoardCreator, BigBoardEntry, Comment, ConsensusBigBoard, DraftBoardFilter, ForumPost, ForumPostFilter, Video, VideoQuery } from "../model/OnDraftContent";
import { ArticleNotFound, BigBoardNotFound, CommentNotFound, DuplicateBigBoardYear, DuplicatePlayer, DuplicateArticle, DuplicateForumPost, ForumPostCommentNotFound, type ArticleError, type BigBoardError, type IOnDraftRepository, PlayerNotFound, ForumPostError, ForumPostNotFound } from "./OnDraftRepository";

const MEMORY_LOAD_TEST_SCHOOLS = [
  "Air Force",
  "Akron",
  "Alabama",
  "Appalachian State",
  "Arizona",
  "Arizona State",
  "Arkansas",
  "Arkansas State",
  "Army",
  "Auburn",
  "Ball State",
  "Baylor",
  "Boise State",
  "Boston College",
  "Bowling Green",
  "Buffalo",
  "BYU",
  "California",
  "Central Michigan",
  "Charlotte",
  "Cincinnati",
  "Clemson",
  "Coastal Carolina",
  "Colorado",
  "Colorado State",
  "Delaware",
  "Duke",
  "East Carolina",
  "Eastern Michigan",
  "FIU",
  "Florida",
  "Florida Atlantic",
  "Florida State",
  "Fresno State",
  "Georgia",
  "Georgia Southern",
  "Georgia State",
  "Georgia Tech",
  "Hawaii",
  "Houston",
  "Illinois",
  "Indiana",
  "Iowa",
  "Iowa State",
  "Jacksonville State",
  "James Madison",
  "Kansas",
  "Kansas State",
  "Kennesaw State",
  "Kent State",
];
const MEMORY_LOAD_TEST_POSITIONS = ["QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "IDL", "LB", "CB", "S"] as const;

type InMemoryRepositoryOptions = {
  seedContent?: boolean;
  seedLoadTestBigBoards?: boolean;
};

class InMemoryOnDraftRepository implements IOnDraftRepository {
  private bigBoards: BigBoard[] = [];
  private articles: Article[] = [];
  private forumPosts: ForumPost[] = [];
  private videos: Video[] = [];
  private tagList: Set<string> = new Set();

  constructor(options: InMemoryRepositoryOptions = {}) {
    const currentYear = new Date().getFullYear();
    this.createBigBoardYearSync(currentYear);

    if (options.seedContent !== false) {
      this.seedSampleContent();
    }

    const seedLoadTestBigBoards = options.seedLoadTestBigBoards ?? process.env.ONDRAFT_MEMORY_LOAD_TEST === "true";
    if (seedLoadTestBigBoards) {
      this.seedMemoryLoadTestBigBoards(currentYear);
    }
  }

  private seedMemoryLoadTestBigBoards(year: number): void {
    const ryanBoard = this.findBigBoard(year, "Ryan");
    const aleksBoard = this.findBigBoard(year, "Aleks");
    if (!ryanBoard || !aleksBoard) {
      return;
    }
    ryanBoard.entries = this.createMemoryLoadTestEntries("Ryan");
    aleksBoard.entries = this.createMemoryLoadTestEntries("Aleks");
  }

  private createMemoryLoadTestEntries(creator: "Ryan" | "Aleks"): BigBoardEntry[] {
    const positionCounts = new Map<string, number>();
    return MEMORY_LOAD_TEST_SCHOOLS.map((school, index) => {
      const position = MEMORY_LOAD_TEST_POSITIONS[index % MEMORY_LOAD_TEST_POSITIONS.length];
      const nextPosRank = (positionCounts.get(position) ?? 0) + 1;
      positionCounts.set(position, nextPosRank);
      const rank = creator === "Aleks" ? MEMORY_LOAD_TEST_SCHOOLS.length - index : index + 1;
      const inches = Number(((index % 12) + (index % 4 === 0 ? 0.5 : 0)).toFixed(3));
      return {
        id: `memory-load-${creator.toLowerCase()}-${String(index + 1).padStart(2, "0")}`,
        playerName: `Load Test Player ${String(index + 1).padStart(2, "0")}`,
        position,
        school,
        rank,
        posRank: nextPosRank,
        height: { feet: 6, inches },
        weight: 185 + index,
        playerInfoPublished: true,
        writeup: {
          strengths: "",
          weaknesses: "",
          rundown: "",
        },
        writeupPublished: false,
        notes: `Generated memory load-test entry for ${creator}.`,
      };
    });
  }

  private seedSampleContent(): void {
    const now = new Date();
    const atNoonDaysAgo = (daysAgo: number): Date => {
      const value = new Date(now);
      value.setDate(value.getDate() - daysAgo);
      value.setHours(12, 0, 0, 0);
      return value;
    };
    const createComment = (
      id: string,
      userId: string,
      userName: string,
      text: string,
      daysAgo: number,
      likedByUserIds: string[] = [],
      replies: Comment[] = [],
    ): Comment => ({
      id,
      userId,
      userName,
      text,
      createdAt: atNoonDaysAgo(daysAgo),
      likes: likedByUserIds.length,
      likedByUserIds,
      replies,
    });

    this.articles = [
      {
        id: "A1001",
        published: true,
        title: "The league is starving for pressure, and this EDGE class knows it",
        author: "Ryan McWalter",
        writeup: "Why the most explosive rushers in the next cycle are winning before the tackle can settle the set point.",
        tags: ["EDGE", "Film Room", "Pass Rush"],
        publicationDate: atNoonDaysAgo(3),
        imageUrl: "/images/article-defaults/uprights.png",
        content: {
          type: "html",
          body: `
            <p>The first thing that jumps off this class is how often the top rushers win cleanly with urgency, not gimmicks.</p>
            <p>That matters because NFL boards are built on traits that survive when the picture gets muddy. Burst, bend, and counters still travel.</p>
            <p>Once the season gets moving, expect this group to force difficult conversations at the top of early big boards.</p>
          `,
        },
        comments: [
          createComment(
            "c-a1001-1",
            "sample-reader-1",
            "Scout Sam",
            "The hand usage note here feels right. This class has more finish than people are giving it credit for.",
            2,
            ["sample-reader-2", "sample-reader-3"],
            [
              createComment(
                "c-a1001-1-r1",
                "sample-reader-4",
                "Nina Numbers",
                "The finish is real, but I still want to see how many of these wins come against NFL-caliber tackles.",
                1,
                ["sample-reader-1"],
              ),
            ],
          ),
          createComment(
            "c-a1001-2",
            "sample-reader-5",
            "Draft Dan",
            "This is exactly why I keep circling back to the second tier of edge defenders.",
            1,
            ["sample-reader-1"],
          ),
        ],
        likes: 5,
        likedByUserIds: [
          "sample-reader-1",
          "sample-reader-2",
          "sample-reader-3",
          "sample-reader-4",
          "sample-reader-5",
        ],
      },
      {
        id: "A1002",
        published: true,
        title: "Five quarterback traits that keep showing up on third-and-medium",
        author: "Aleks Ryabinkin",
        writeup: "A quarterback room built on calm feet, layered timing, and answers once the first read disappears.",
        tags: ["QB", "Scouting", "Traits"],
        publicationDate: atNoonDaysAgo(18),
        imageUrl: "/images/article-defaults/football.png",
        content: {
          type: "plainText",
          text: [
            "Quarterback evaluation gets noisy when the game script is friendly.",
            "Third-and-medium strips away some of that comfort and leaves you with timing, discipline, and processing speed.",
            "The passers who keep drives alive in those moments usually carry cleaner translatable habits into Sundays.",
          ].join("\n\n"),
        },
        comments: [
          createComment(
            "c-a1002-1",
            "sample-reader-2",
            "Pocket Pete",
            "The footwork point is the one that usually decides whether I stay in or drop out on a guy.",
            16,
            ["sample-reader-1", "sample-reader-3"],
          ),
        ],
        likes: 4,
        likedByUserIds: ["sample-reader-1", "sample-reader-2", "sample-reader-3", "sample-reader-4"],
      },
      {
        id: "A1003",
        published: true,
        title: "The slot separators keeping this receiver class honest",
        author: "Ryan McWalter",
        writeup: "These are the route runners who give an offense easier throws and force defenses to squeeze the middle of the field.",
        tags: ["WR", "Big Board", "Route Running"],
        publicationDate: atNoonDaysAgo(46),
        imageUrl: "/images/article-defaults/helmet.png",
        content: {
          type: "plainText",
          text: [
            "Not every receiver has to win on the outside to matter at the top of a board.",
            "The middle of the field still belongs to pass catchers who understand leverage and finish through contact.",
            "This group has more of those players than last year did.",
          ].join("\n\n"),
        },
        comments: [],
        likes: 3,
        likedByUserIds: ["sample-reader-1", "sample-reader-2", "sample-reader-3"],
      },
      {
        id: "A1004",
        published: true,
        title: "Running backs who still create their own yards after the chalk breaks",
        author: "Aleks Ryabinkin",
        writeup: "A look at the runners whose contact balance and pacing keep the position valuable when blocking falls apart.",
        tags: ["RB", "Scouting", "Offense"],
        publicationDate: atNoonDaysAgo(190),
        imageUrl: "/images/article-defaults/football.png",
        content: {
          type: "html",
          body: `
            <p>The easiest rushing yards are usually blocked. The meaningful ones rarely are.</p>
            <p>This class still has a few backs who understand tempo, can absorb contact, and stay on schedule anyway.</p>
          `,
        },
        comments: [
          createComment(
            "c-a1004-1",
            "sample-reader-6",
            "Tape Grinder",
            "Love the pacing callout here. A lot of backs have speed but not enough pacing to unlock it.",
            184,
            ["sample-reader-2"],
          ),
        ],
        likes: 4,
        likedByUserIds: ["sample-reader-1", "sample-reader-2", "sample-reader-3", "sample-reader-4"],
      },
      {
        id: "A1005",
        published: true,
        title: "What last year taught us about overreacting to spring draft boards",
        author: "Ryan McWalter",
        writeup: "A reset on patience, projection, and why the loudest March board is rarely the one that ages the best.",
        tags: ["Draft History", "Process", "Board Building"],
        publicationDate: atNoonDaysAgo(430),
        imageUrl: "/images/article-defaults/uprights.png",
        content: {
          type: "plainText",
          text: [
            "Draft boards should move. They just should not panic.",
            "The best spring work usually narrows the real questions instead of pretending everything is already solved.",
            "That lesson holds up every single cycle.",
          ].join("\n\n"),
        },
        comments: [],
        likes: 6,
        likedByUserIds: [
          "sample-reader-1",
          "sample-reader-2",
          "sample-reader-3",
          "sample-reader-4",
          "sample-reader-5",
          "sample-reader-6",
        ],
      },
    ];

    this.videos = [
      {
        youtubeUrl: "https://www.youtube.com/watch?v=BH3X-llq1M4&pp=ugUEEgJlbg%3D%3D",
        title: "Quarterback room check-in: what still translates on Sundays",
        description: "A sample Bar TV entry focused on pocket movement, timing windows, and how to separate traits from college comfort.",
        videoId: "BH3X-llq1M4",
        tags: ["QB", "Film Room", "Bar TV"],
        createdAt: atNoonDaysAgo(2),
        updatedAt: atNoonDaysAgo(2),
        thumbnailUrl: "https://img.youtube.com/vi/BH3X-llq1M4/hqdefault.jpg",
        viewCount: 12840,
        youtubeStatsFetchedAt: atNoonDaysAgo(1),
      },
      {
        youtubeUrl: "https://www.youtube.com/watch?v=uza2KtmxZ9g",
        title: "Building pressure without panic: edge and interior notes",
        description: "A sample video on pass-rush translation, coverage marriage, and why the best fronts create bad quarterback decisions early.",
        videoId: "uza2KtmxZ9g",
        tags: ["EDGE", "Defense", "Pressure"],
        createdAt: atNoonDaysAgo(11),
        updatedAt: atNoonDaysAgo(11),
        thumbnailUrl: "https://img.youtube.com/vi/uza2KtmxZ9g/hqdefault.jpg",
        viewCount: 9420,
        youtubeStatsFetchedAt: atNoonDaysAgo(1),
      },
      {
        youtubeUrl: "https://www.youtube.com/watch?v=5Lqtx40NloQ&pp=ugUEEgJlbg%3D%3D",
        title: "Late-round bets worth making before the board catches up",
        description: "A sample Bar TV entry highlighting developmental traits, role projection, and the kinds of depth bets smart teams keep making.",
        videoId: "5Lqtx40NloQ",
        tags: ["Sleepers", "Big Board", "Traits"],
        createdAt: atNoonDaysAgo(54),
        updatedAt: atNoonDaysAgo(54),
        thumbnailUrl: "https://img.youtube.com/vi/5Lqtx40NloQ/hqdefault.jpg",
        viewCount: 6840,
        youtubeStatsFetchedAt: atNoonDaysAgo(1),
      },
    ];

    this.forumPosts = [
      {
        id: "post-1",
        userId: "sample-forum-1",
        userName: "Scout Sam",
        content: "Hot take: the safest offensive linemen in this class are the ones who already look boring on Saturdays. Quiet feet age well.",
        createdAt: atNoonDaysAgo(1),
        likes: 3,
        likedByUserIds: ["sample-reader-1", "sample-reader-2", "sample-reader-3"],
        comments: [
          createComment(
            "c-post-1-1",
            "sample-forum-2",
            "Nina Numbers",
            "Boring is good when it means the quarterback never has to think about his blind side.",
            1,
            ["sample-reader-1"],
          ),
        ],
      },
      {
        id: "post-2",
        userId: "sample-forum-3",
        userName: "Pocket Pete",
        content: "I still think the deepest value pocket on this board is day-two receiver, not running back.",
        createdAt: atNoonDaysAgo(4),
        likes: 2,
        likedByUserIds: ["sample-reader-2", "sample-reader-3"],
        comments: [
          createComment(
            "c-post-2-1",
            "sample-forum-4",
            "Draft Dan",
            "Depends on how many teams decide they need role players versus alpha traits.",
            3,
          ),
          createComment(
            "c-post-2-2",
            "sample-forum-1",
            "Scout Sam",
            "The receiver pool is just easier to project into useful snaps right now.",
            2,
            ["sample-reader-4"],
          ),
        ],
      },
      {
        id: "post-3",
        userId: "sample-forum-5",
        userName: "Tape Grinder",
        content: "Quarterback rankings should start with pressure answers, not highlight throws. If the pocket gets loud, I need proof.",
        createdAt: atNoonDaysAgo(9),
        likes: 4,
        likedByUserIds: ["sample-reader-1", "sample-reader-2", "sample-reader-3", "sample-reader-4"],
        comments: [],
      },
      {
        id: "post-4",
        userId: "sample-forum-6",
        userName: "Maya Matchups",
        content: "The next big board riser is going to be a corner who already survives with route recognition instead of just raw speed.",
        createdAt: atNoonDaysAgo(16),
        likes: 1,
        likedByUserIds: ["sample-reader-2"],
        comments: [
          createComment(
            "c-post-4-1",
            "sample-forum-3",
            "Pocket Pete",
            "That archetype always gets louder once teams start comparing third-down tape.",
            14,
          ),
        ],
      },
    ];

    this.syncTagList();
  }

  private syncTagList(): void {
    this.tagList = new Set([
      ...this.articles.flatMap((article) => article.tags ?? []),
      ...this.videos.flatMap((video) => video.tags ?? []),
    ]);
  }

  private findBigBoard(year: number, creator: BigBoardCreator): BigBoard | undefined {
    return this.bigBoards.find((bigBoard) => bigBoard.year === year && bigBoard.creator === creator);
  }

  private createBigBoardYearSync(year: number): void {
    BIG_BOARD_CREATORS.forEach((creator) => {
      this.bigBoards.push({ year, creator, entries: [] });
    });
  }

  private findCommentById(comments: Comment[], commentId: string): Comment | undefined {
    for (const comment of comments) {
      if (comment.id === commentId) {
        return comment;
      }

      const reply = this.findCommentById(comment.replies, commentId);
      if (reply) {
        return reply;
      }
    }

    return undefined;
  }

  private deleteCommentById(comments: Comment[], commentId: string): boolean {
    const commentIndex = comments.findIndex((entry) => entry.id === commentId);
    if (commentIndex !== -1) {
      comments.splice(commentIndex, 1);
      return true;
    }

    return comments.some((comment) => this.deleteCommentById(comment.replies, commentId));
  }

  async getSavedSchools(year: number): Promise<Result<string[], BigBoardError>> {
    const schools = new Set<string>();
    this.bigBoards.forEach((bigBoard) => {
      if (bigBoard.year === year) {
        bigBoard.entries.forEach((entry) => {
          schools.add(entry.school);
        });
      }
    });
    return Ok([...schools].sort((a, b) => a.localeCompare(b)));
  }

  async getBigBoard(year: number, creator: BigBoardCreator, filter?: DraftBoardFilter): Promise<Result<BigBoard, BigBoardError>> {
    const bigBoard = creator === "Consensus"
      ? this.generateConsensusBigBoard(year)
      : this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    let entries = [...bigBoard.entries];
    if (filter) {
      entries = entries.filter((entry) => {
        if (filter.position && entry.position !== filter.position) {
          return false;
        }
        if (filter.school && entry.school.toLowerCase() !== filter.school.toLowerCase()) {
          return false;
        }
        return true;
      });
    }
    return Ok({ ...bigBoard, entries });
  }

  private generateConsensusBigBoard(year: number): BigBoard {
    const ryanBoard = this.findBigBoard(year, "Ryan");
    const aleksBoard = this.findBigBoard(year, "Aleks");
    const entriesByPlayer = new Map<string, { Ryan?: BigBoardEntry; Aleks?: BigBoardEntry }>();
    type ConsensusEntryDraft = {
      entry: BigBoardEntry;
      averageRank: number;
      averagePosRank: number;
      ryanRank: number;
      ryanPosRank: number;
      aleksRank: number;
      aleksPosRank: number;
    };

    ryanBoard?.entries.filter((entry) => entry.playerInfoPublished).forEach((entry) => {
      entriesByPlayer.set(entry.playerName, {
        ...entriesByPlayer.get(entry.playerName),
        Ryan: entry,
      });
    });
    aleksBoard?.entries.filter((entry) => entry.playerInfoPublished).forEach((entry) => {
      entriesByPlayer.set(entry.playerName, {
        ...entriesByPlayer.get(entry.playerName),
        Aleks: entry,
      });
    });

    const average = (values: Array<number | null | undefined>): number => {
      const rankedValues = values.filter((value): value is number => typeof value === "number");
      if (rankedValues.length === 0) {
        return Number.MAX_SAFE_INTEGER;
      }
      return rankedValues.reduce((sum, value) => sum + value, 0) / rankedValues.length;
    };

    const compareOverall = (first: ConsensusEntryDraft, second: ConsensusEntryDraft): number => (
      first.averageRank - second.averageRank ||
      first.ryanRank - second.ryanRank ||
      first.aleksRank - second.aleksRank ||
      first.entry.playerName.localeCompare(second.entry.playerName)
    );

    const comparePosition = (first: ConsensusEntryDraft, second: ConsensusEntryDraft): number => (
      first.averagePosRank - second.averagePosRank ||
      first.ryanPosRank - second.ryanPosRank ||
      first.aleksPosRank - second.aleksPosRank ||
      (first.entry.rank ?? Number.MAX_SAFE_INTEGER) - (second.entry.rank ?? Number.MAX_SAFE_INTEGER) ||
      first.entry.playerName.localeCompare(second.entry.playerName)
    );

    const consensusDrafts: ConsensusEntryDraft[] = [...entriesByPlayer.values()].map(({ Ryan, Aleks }) => {
      const sourceOfTruth = Ryan ?? Aleks;
      if (!sourceOfTruth) {
        throw new Error("Consensus entry cannot be created without a source player.");
      }

      const averageRank = average([Ryan?.rank, Aleks?.rank]);
      const averagePosRank = average([Ryan?.posRank, Aleks?.posRank]);
      const rankDiscrepency = typeof Ryan?.rank === "number" && typeof Aleks?.rank === "number"
        ? Math.abs(Ryan.rank - Aleks.rank)
        : 0;

      return {
        entry: {
          ...sourceOfTruth,
          id: `consensus-${sourceOfTruth.id}`,
          rank: null,
          posRank: null,
          bigDiscrepency: rankDiscrepency > 10,
        },
        averageRank,
        averagePosRank,
        ryanRank: Ryan?.rank ?? Number.MAX_SAFE_INTEGER,
        ryanPosRank: Ryan?.posRank ?? Number.MAX_SAFE_INTEGER,
        aleksRank: Aleks?.rank ?? Number.MAX_SAFE_INTEGER,
        aleksPosRank: Aleks?.posRank ?? Number.MAX_SAFE_INTEGER,
      };
    });

    consensusDrafts.sort(compareOverall);
    consensusDrafts.forEach((draft, index) => {
      draft.entry.rank = index + 1;
    });

    const draftsByPosition = new Map<string, ConsensusEntryDraft[]>();
    consensusDrafts.forEach((draft) => {
      const positionDrafts = draftsByPosition.get(draft.entry.position) ?? [];
      positionDrafts.push(draft);
      draftsByPosition.set(draft.entry.position, positionDrafts);
    });
    draftsByPosition.forEach((positionDrafts) => {
      positionDrafts.sort(comparePosition);
      positionDrafts.forEach((draft, index) => {
        draft.entry.posRank = index + 1;
      });
    });

    return { year, creator: "Consensus", entries: consensusDrafts.map((draft) => draft.entry) };
  }

  async createBigBoardYear(year: number): Promise<Result<void, BigBoardError>> {
    if (this.bigBoards.find((bb) => bb.year === year)) {
      return Err(DuplicateBigBoardYear(`Big boards for ${year} already exist.`));
    }
    this.createBigBoardYearSync(year);
    return Ok(undefined);
  }

  async deleteBigBoardYear(year: number): Promise<Result<void, BigBoardError>> {
    const startingLength = this.bigBoards.length;
    this.bigBoards = this.bigBoards.filter((bigBoard) => bigBoard.year !== year);
    if (this.bigBoards.length === startingLength) {
      return Err(BigBoardNotFound(`Big boards for ${year} were not found.`));
    }
    return Ok(undefined);
  }

  async getBigBoardYears(): Promise<Result<number[], BigBoardError>> {
    const years = new Set(this.bigBoards.map((bigBoard) => bigBoard.year));
    return Ok([...years].sort((first, second) => second - first));
  }

  async getArticles(published = true): Promise<Result<Article[], ArticleError>> {
    return Ok(this.articles.filter(article => article.published === published));
  }

  async getArticleTags(): Promise<Result<string[], ArticleError>> {
    const tags = new Set<string>();
    this.articles.forEach((article) => {
      (article.tags ?? []).forEach((tag) => tags.add(tag));
    });

    return Ok([...tags].sort((a, b) => a.localeCompare(b)));
  }

  async getFilteredArticles(filter: ArticleFilter): Promise<Result<Article[], ArticleError>> {
    const published = filter.published ?? true;
    const filtered = this.articles.filter(article => article.published === published).filter((article) => {
      if (filter.author && !article.author.toLowerCase().includes(filter.author.toLowerCase())) {
        return false;
      }

      if (filter.publicationDateRange) {
        const publishedAt = article.publicationDate.getTime();
        if (
          publishedAt < filter.publicationDateRange.from.getTime() ||
          publishedAt > filter.publicationDateRange.to.getTime()
        ) {
          return false;
        }
      }

      if (filter.keyword) {
        const keyword = filter.keyword.toLowerCase();
        const contentText = article.content.type === "plainText" || article.content.type === "html"
          ? article.content.type === "plainText"
            ? article.content.text
            : article.content.body
          : article.content.originalName;
        const searchText = `${article.title} ${article.author} ${article.writeup} ${(article.tags ?? []).join(" ")} ${contentText}`;
        if (!searchText.toLowerCase().includes(keyword)) {
          return false;
        }
      }

      if (filter.tags && filter.tags.length > 0) {
        const articleTags = (article.tags ?? []).map((tag) => tag.toLowerCase());
        const requiredTags = filter.tags.map((tag) => tag.toLowerCase());
        if (!requiredTags.every((tag) => articleTags.includes(tag))) {
          return false;
        }
      }

      return true;
    });

    const sortBy = filter.sortBy ?? "date";
    const direction = filter.sortDirection === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((first, second) => {
      const firstValue = sortBy === "likes"
        ? first.likes
        : sortBy === "comments"
          ? first.comments.length
          : first.publicationDate.getTime();
      const secondValue = sortBy === "likes"
        ? second.likes
        : sortBy === "comments"
          ? second.comments.length
          : second.publicationDate.getTime();

      return (firstValue - secondValue) * direction;
    });

    return Ok(sorted);
  }

  async createArticle(article: Article): Promise<Result<Article, ArticleError>> {
    if (this.articles.find(a => a.id === article.id)) {
      return Err(DuplicateArticle(`Article with id "${article.id}" already exists.`));
    }
    this.articles.push(article);
    this.tagList = new Set([...this.tagList, ...(article.tags ?? [])]);
    return Ok(article);
  }

  async createBigBoardEntry(year: number, creator: BigBoardCreator, entry: BigBoardEntry): Promise<Result<BigBoardEntry, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    if (bigBoard.entries.find(e => e.id === entry.id)) {
      return Err(DuplicatePlayer(`Big board entry with id "${entry.id}" already exists in the ${year} ${creator} big board.`));
    }
    bigBoard.entries.push(entry);
    return Ok(entry);
  }

  async updateBigBoardEntry(year: number, creator: BigBoardCreator, entry: BigBoardEntry): Promise<Result<BigBoardEntry, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    const index = bigBoard.entries.findIndex(e => e.id === entry.id);
    if (index === -1) {
      return Err(PlayerNotFound(`Big board entry with id "${entry.id}" was not found in the ${year} ${creator} big board.`));
    }
    bigBoard.entries[index] = entry;
    return Ok(entry);
  }

  async replaceBigBoardEntries(year: number, creator: BigBoardCreator, entries: BigBoardEntry[]): Promise<Result<BigBoard, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    bigBoard.entries = entries;
    return Ok(bigBoard);
  }

  async deleteArticle(id: string): Promise<Result<void, ArticleError>> {
    const index = this.articles.findIndex(a => a.id === id);
    if (index === -1) {
      return Err(ArticleNotFound(`Article with id "${id}" not found.`));
    }
    this.articles.splice(index, 1);
    const article = this.articles[index];
    if (article && article.tags) {
      article.tags.forEach((tag) => {
        const tagExistsInOtherArticles = this.articles.some((a) => a !== article && a.tags?.includes(tag));
        if (!tagExistsInOtherArticles) {
          this.tagList.delete(tag);
        }
      });
    }
    return Ok(undefined);
  }

  async deleteBigBoardEntry(year: number, creator: BigBoardCreator, playerName: string): Promise<Result<void, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    const index = bigBoard.entries.findIndex(e => e.playerName === playerName);
    if (index === -1) {
      return Err(PlayerNotFound(`Player with name "${playerName}" not found in the ${year} ${creator} big board.`));
    }
    bigBoard.entries.splice(index, 1);
    return Ok(undefined);
  }

  async getBigBoardEntry(year: number, creator: BigBoardCreator, playerName: string): Promise<Result<BigBoardEntry, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    const entry = bigBoard.entries.find(e => e.playerName === playerName);
    if (!entry) {
      return Err(PlayerNotFound(`Player with name "${playerName}" not found in the ${year} ${creator} big board.`));
    }
    return Ok(entry);
  }

  async getBigBoardEntryById(year: number, creator: BigBoardCreator, entryId: string): Promise<Result<BigBoardEntry, BigBoardError>> {
    const bigBoard = this.findBigBoard(year, creator);
    if (!bigBoard) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    const entry = bigBoard.entries.find(e => e.id === entryId);
    if (!entry) {
      return Err(PlayerNotFound(`Big board entry with id "${entryId}" was not found in the ${year} ${creator} big board.`));
    }
    return Ok(entry);
  }

  async getArticle(id: string): Promise<Result<Article, ArticleError>> {
    const article = this.articles.find(a => a.id === id);
    if (!article) {
      return Err(ArticleNotFound(`Article with id "${id}" not found.`));
    }
    return Ok(article);
  }

  async updateArticle(article: Article): Promise<Result<Article, ArticleError>> {
    const articleIndex = this.articles.findIndex(a => a.id === article.id);
    if (articleIndex === -1) {
      return Err(ArticleNotFound(`Article with id "${article.id}" not found.`));
    }

    this.articles[articleIndex] = article;
    return Ok(article);
  }

  async commentByArticleId(articleId: string, comment: Comment): Promise<Result<Comment, ArticleError>> {
    const article = this.articles.find(a => a.id === articleId);
    if (!article) {
      return Err(ArticleNotFound(`Article with id "${articleId}" not found.`));
    }

    article.comments.push(comment);
    return Ok(comment);
  }

  async commentReplyByCommentId(commentId: string, reply: Comment): Promise<Result<Comment, ArticleError>> {
    for (const article of this.articles) {
      const parentComment = this.findCommentById(article.comments, commentId);
      if (parentComment) {
        parentComment.replies.push(reply);
        return Ok(reply);
      }
    }
    return Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
  }

  private toggleLike(likedByUserIds: string[], userId: string): number {
    const likeIndex = likedByUserIds.indexOf(userId);
    if (likeIndex === -1) {
      likedByUserIds.push(userId);
    } else {
      likedByUserIds.splice(likeIndex, 1);
    }

    return likedByUserIds.length;
  }

  async likeByArticleId(articleId: string, userId: string): Promise<Result<Article, ArticleError>> {
    const article = this.articles.find(a => a.id === articleId);
    if (!article) {
      return Err(ArticleNotFound(`Article with id "${articleId}" not found.`));
    }

    article.likes = this.toggleLike(article.likedByUserIds, userId);
    return Ok(article);
  }

  async likeByCommentId(commentId: string, userId: string): Promise<Result<Comment, ArticleError>> {
    for (const article of this.articles) {
      const comment = this.findCommentById(article.comments, commentId);
      if (comment) {
        comment.likes = this.toggleLike(comment.likedByUserIds, userId);
        return Ok(comment);
      }
    }

    return Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
  }

  async deleteComment(commentId: string): Promise<Result<void, ArticleError>> {
    for (const article of this.articles) {
      if (this.deleteCommentById(article.comments, commentId)) {
        return Ok(undefined);
      }
    }

    return Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
  }

  async createForumPost(post: ForumPost): Promise<Result<ForumPost, ForumPostError>> {
    if (this.forumPosts.find((existingPost) => existingPost.id === post.id)) {
      return Err(DuplicateForumPost(`Hot take with id "${post.id}" already exists.`));
    }
    this.forumPosts.push(post);
    return Ok(post);
  }

  async getForumPosts(): Promise<Result<ForumPost[], ForumPostError>> {
    return Ok([...this.forumPosts].sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime()));
  }

  async getForumPost(postId: string): Promise<Result<ForumPost, ForumPostError>> {
    const post = this.forumPosts.find(p => p.id === postId);
    if (!post) {
      return Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
    }
    return Ok(post);
  }

  async likeByForumPostId(postId: string, userId: string): Promise<Result<ForumPost, ForumPostError>> {
    const post = this.forumPosts.find(p => p.id === postId);
    if (!post) {
      return Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
    }
    post.likes = this.toggleLike(post.likedByUserIds, userId);
    return Ok(post);
  }

  async commentByForumPostId(postId: string, comment: Comment): Promise<Result<Comment, ForumPostError>> {
    const post = this.forumPosts.find(p => p.id === postId);
    if (!post) {
      return Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
    }
    post.comments.push(comment);
    return Ok(comment);
  }

  async deleteForumPostComment(commentId: string): Promise<Result<void, ForumPostError>> {
    for (const post of this.forumPosts) {
      const index = post.comments.findIndex((comment) => comment.id === commentId);
      if (index !== -1) {
        post.comments.splice(index, 1);
        return Ok(undefined);
      }
    }

    return Err(ForumPostCommentNotFound(`Comment with id "${commentId}" not found.`));
  }

  async getFilteredForumPosts(filter: ForumPostFilter): Promise<Result<ForumPost[], ForumPostError>> {
    const filtered = this.forumPosts.filter((post) => {
      if (filter.userId && post.userId !== filter.userId) {
        return false;
      }
      if (filter.keyword) {
        const keyword = filter.keyword.toLowerCase();
        const searchText = `${post.userName} ${post.content} ${post.comments.map((comment) => comment.text).join(" ")}`;
        if (!searchText.toLowerCase().includes(keyword)) {
          return false;
        }
      }
      if (filter.dateRange) {
        const createdAt = post.createdAt.getTime();
        if (createdAt < filter.dateRange.from.getTime() || createdAt > filter.dateRange.to.getTime()) {
          return false;
        }
      }
      return true;
    });

    const sortBy = filter.sortBy ?? "date";
    const direction = filter.sortDirection === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((first, second) => {
      const firstValue = sortBy === "likes"
        ? first.likes
        : sortBy === "comments"
          ? first.comments.length
          : first.createdAt.getTime();
      const secondValue = sortBy === "likes"
        ? second.likes
        : sortBy === "comments"
          ? second.comments.length
          : second.createdAt.getTime();

      return (firstValue - secondValue) * direction;
    });

    return Ok(sorted);
  }

  async deleteForumPost(postId: string): Promise<Result<void, ForumPostError>> {
    const index = this.forumPosts.findIndex(p => p.id === postId);
    if (index === -1) {
      return Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
    }
    this.forumPosts.splice(index, 1);
    return Ok(undefined);
  }

  async createYoutubeVideo(video: Video): Promise<Result<Video, ArticleError>> {
    if (this.videos.find((existing) => existing.videoId === video.videoId)) {
      return Err(DuplicateArticle(`YouTube video with id "${video.videoId}" already exists.`));
    }
    this.videos.push(video);
    this.tagList = new Set([...this.tagList, ...(video.tags ?? [])]);
    return Ok(video);
  }

  async getYoutubeVideo(videoId: string): Promise<Result<Video, ArticleError>> {
    const video = this.videos.find((existing) => existing.videoId === videoId);
    if (!video) {
      return Err(ArticleNotFound(`YouTube video with id "${videoId}" not found.`));
    }
    return Ok(video);
  }

  async getYoutubeVideos(): Promise<Result<Video[], ArticleError>> {
    return Ok([...this.videos].sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime()));
  }

  async getVideoTags(): Promise<Result<string[], ArticleError>> {
    const tags = new Set<string>();
    this.videos.forEach((video) => {
      video.tags.forEach((tag) => tags.add(tag));
    });

    return Ok([...tags].sort((a, b) => a.localeCompare(b)));
  }

  async filterYoutubeVideos(query: VideoQuery): Promise<Result<Video[], ArticleError>> {
    const filtered = this.videos.filter((video) => {
      if (query.keyword) {
        const keyword = query.keyword.toLowerCase();
        const searchText = `${video.title} ${video.description} ${video.tags.join(" ")}`;
        if (!searchText.toLowerCase().includes(keyword)) {
          return false;
        }
      }

      if (query.tags && query.tags.length > 0) {
        const videoTags = video.tags.map((tag) => tag.toLowerCase());
        const requiredTags = query.tags.map((tag) => tag.toLowerCase());
        if (!requiredTags.every((tag) => videoTags.includes(tag))) {
          return false;
        }
      }

      if (query.dateRange) {
        const createdAt = video.createdAt.getTime();
        if (createdAt < query.dateRange.from.getTime() || createdAt > query.dateRange.to.getTime()) {
          return false;
        }
      }

      return true;
    });

    const sortBy = query.sortBy ?? "date";
    const direction = query.sortDirection === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((first, second) => {
      const firstValue = sortBy === "popularity" ? first.viewCount ?? 0 : first.createdAt.getTime();
      const secondValue = sortBy === "popularity" ? second.viewCount ?? 0 : second.createdAt.getTime();

      return (firstValue - secondValue) * direction;
    });

    return Ok(sorted);
  }

  async updateYoutubeVideo(videoId: string, video: Video): Promise<Result<Video, ArticleError>> {
    const videoIndex = this.videos.findIndex((existing) => existing.videoId === videoId);
    if (videoIndex === -1) {
      return Err(ArticleNotFound(`YouTube video with id "${videoId}" not found.`));
    }
    const duplicate = this.videos.find((existing) => existing.videoId === video.videoId && existing.videoId !== videoId);
    if (duplicate) {
      return Err(DuplicateArticle(`YouTube video with id "${video.videoId}" already exists.`));
    }

    this.videos[videoIndex] = video;
    this.tagList = new Set([...this.tagList, ...(video.tags ?? [])]);
    return Ok(video);
  }

  async updateYoutubeVideoStats(videoId: string, stats: { thumbnailUrl?: string; viewCount?: number; youtubeStatsFetchedAt: Date }): Promise<Result<Video, ArticleError>> {
    const videoIndex = this.videos.findIndex((video) => video.videoId === videoId);
    if (videoIndex === -1) {
      return Err(ArticleNotFound(`YouTube video with id "${videoId}" not found.`));
    }

    const updated: Video = {
      ...this.videos[videoIndex],
      thumbnailUrl: stats.thumbnailUrl ?? this.videos[videoIndex].thumbnailUrl,
      viewCount: stats.viewCount ?? this.videos[videoIndex].viewCount,
      youtubeStatsFetchedAt: stats.youtubeStatsFetchedAt,
      updatedAt: new Date(),
    };
    this.videos[videoIndex] = updated;
    return Ok(updated);
  }

  async deleteYoutubeVideo(videoId: string): Promise<Result<void, ArticleError>> {
    const videoIndex = this.videos.findIndex((video) => video.videoId === videoId);
    if (videoIndex === -1) {
      return Err(ArticleNotFound(`YouTube video with id "${videoId}" not found.`));
    }
    this.videos.splice(videoIndex, 1);
    return Ok(undefined);
  }

  async getTags(): Promise<Result<string[], ArticleError>> {
    return Ok([...this.tagList].sort((a, b) => a.localeCompare(b)));
  }

  async getConsensusBigBoard(year: number): Promise<Result<ConsensusBigBoard, BigBoardError>> {
    if (!this.bigBoards.find(bb => bb.year === year)) {
      return Err(BigBoardNotFound(`Big board for ${year} was not found.`));
    }
    const generated = this.generateConsensusBigBoard(year);
    const consensusBigBoard: ConsensusBigBoard = {
      year: generated.year,
      entries: generated.entries.map((entry) => ({
        playerName: entry.playerName,
        position: entry.position as ConsensusBigBoard["entries"][number]["position"],
        school: entry.school,
        rank: entry.rank,
        posRank: entry.posRank,
        height: entry.height,
        weight: entry.weight,
        bigDiscrepency: entry.bigDiscrepency ?? false,
      })),
    };
    return Ok(consensusBigBoard);
  }
}

export function CreateInMemoryOnDraftRepository(options?: InMemoryRepositoryOptions): IOnDraftRepository {
  return new InMemoryOnDraftRepository(options);
}
