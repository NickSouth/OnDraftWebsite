import { Err, Ok, type Result } from "../lib/result";
import {
  Article,
  ArticleFilter,
  BIG_BOARD_CREATORS,
  BigBoard,
  BigBoardCreator,
  BigBoardEntry,
  BigBoardPlayerSearchHit,
  Comment,
  ConsensusBigBoard,
  ConsensusDiscrepancyWriteup,
  DraftBoardFilter,
  ForumPost,
  ForumPostFilter,
  Newsletter,
  Position,
  Video,
  VideoQuery,
} from "../model/OnDraftContent";
import { toDraftGrade, type DraftGrade } from "../model/DraftGrades";
import { buildConsensusBigBoard } from "../model/ConsensusBoard";
import { getPrismaClient, type OnDraftPrismaClient } from "../prisma/client";
import {
  ArticleNotFound,
  BigBoardNotFound,
  CommentNotFound,
  DatabaseError,
  DuplicateArticle,
  DuplicateBigBoardYear,
  DuplicateForumPost,
  DuplicateNewsletter,
  DuplicatePlayer,
  ForumPostCommentNotFound,
  ForumPostNotFound,
  PlayerNotFound,
  type ArticleError,
  type BigBoardError,
  type ForumPostError,
  type IOnDraftRepository,
  type NewsletterError,
  NewsletterNotFound,
} from "./OnDraftRepository";

type ArticleRecord = Awaited<ReturnType<OnDraftPrismaClient["article"]["findUnique"]>>;
type BigBoardRecord = Awaited<ReturnType<OnDraftPrismaClient["bigBoard"]["findUnique"]>>;
type ForumPostRecord = Awaited<ReturnType<OnDraftPrismaClient["forumPost"]["findUnique"]>>;
type VideoRecord = Awaited<ReturnType<OnDraftPrismaClient["video"]["findUnique"]>>;
type NewsletterRecord = Awaited<ReturnType<OnDraftPrismaClient["newsletter"]["findUnique"]>>;

class PrismaOnDraftRepository implements IOnDraftRepository {
  constructor(private readonly prisma: OnDraftPrismaClient = getPrismaClient()) {}

  private bigBoardId(year: number, creator: BigBoardCreator): string {
    return `${year}:${creator}`;
  }

  private tagId(tag: string): string {
    return tag.trim().toLowerCase();
  }

  private async tagConnections(tags: string[]) {
    return tags.map((tag) => ({
      tag: {
        connectOrCreate: {
          where: { name: tag },
          create: { id: this.tagId(tag), name: tag },
        },
      },
    }));
  }

  private articleContentData(article: Article) {
    return {
      contentType: article.content.type,
      plainText: article.content.type === "plainText" ? article.content.text : null,
      htmlBody: article.content.type === "html" ? article.content.body : null,
      pdfUrl: article.content.type === "pdf" ? article.content.url : null,
      pdfOriginalName: article.content.type === "pdf" ? article.content.originalName : null,
      pdfMimeType: article.content.type === "pdf" ? article.content.mimeType : null,
      pdfSize: article.content.type === "pdf" ? article.content.size : null,
    };
  }

  private articleInclude() {
    return {
      tags: { include: { tag: true } },
      likes: { orderBy: { createdAt: "asc" as const } },
    };
  }

  private async mapArticle(record: NonNullable<ArticleRecord> & {
    tags?: Array<{ tag: { name: string } }>;
    likes?: Array<{ actorId: string }>;
  }): Promise<Article> {
    const comments = await this.getArticleCommentTree(record.id);
    const content = record.contentType === "plainText"
      ? { type: "plainText" as const, text: record.plainText ?? "" }
      : record.contentType === "html"
        ? { type: "html" as const, body: record.htmlBody ?? "" }
        : {
            type: "pdf" as const,
            url: record.pdfUrl ?? "",
            originalName: record.pdfOriginalName ?? "",
            mimeType: "application/pdf" as const,
            size: record.pdfSize ?? 0,
          };
    const likedByUserIds = (record.likes ?? []).map((like) => like.actorId);
    return {
      id: record.id,
      published: record.published,
      title: record.title,
      author: record.author,
      writeup: record.writeup,
      tags: (record.tags ?? []).map((entry) => entry.tag.name),
      publicationDate: record.publicationDate,
      content,
      imageUrl: record.imageUrl ?? undefined,
      comments,
      likes: likedByUserIds.length,
      likedByUserIds,
    };
  }

  private mapComment(record: {
    id: string;
    userId: string;
    userName: string;
    text: string;
    createdAt: Date;
    parentCommentId?: string | null;
    likes?: Array<{ actorId: string }>;
  }): Comment {
    const likedByUserIds = (record.likes ?? []).map((like) => like.actorId);
    return {
      id: record.id,
      userId: record.userId,
      userName: record.userName,
      text: record.text,
      createdAt: record.createdAt,
      likes: likedByUserIds.length,
      likedByUserIds,
      replies: [],
    };
  }

  private async getArticleCommentTree(articleId: string): Promise<Comment[]> {
    const records = await this.prisma.comment.findMany({
      where: { articleId },
      include: { likes: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    const byId = new Map<string, Comment>();
    records.forEach((record) => byId.set(record.id, this.mapComment(record)));

    const roots: Comment[] = [];
    records.forEach((record) => {
      const comment = byId.get(record.id);
      if (!comment) {
        return;
      }
      const parent = record.parentCommentId ? byId.get(record.parentCommentId) : null;
      if (parent) {
        parent.replies.push(comment);
      } else {
        roots.push(comment);
      }
    });
    return roots;
  }

  private async findArticle(id: string): Promise<Article | null> {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: this.articleInclude(),
    });
    return article ? this.mapArticle(article) : null;
  }

  private mapBigBoardEntry(record: {
    id: string;
    playerName: string;
    position: string;
    school: string;
    rank: number | null;
    posRank: number | null;
    heightFeet: number | null;
    heightInches: number | null;
    weight: number | null;
    strengths: string;
    weaknesses: string;
    rundown: string;
    notes: string;
    grade: unknown;
    gradeValue: string;
    playerInfoPublished: boolean;
    gradePublished: boolean;
    writeupPublished: boolean;
  }): BigBoardEntry {
    const grade = toDraftGrade(
      record.grade && typeof record.grade === "object" && !Array.isArray(record.grade)
        ? { ...record.grade, value: record.gradeValue }
        : record.grade,
      record.position as Position | ""
    );
    return {
      id: record.id,
      playerName: record.playerName,
      position: record.position as Position | "",
      school: record.school,
      rank: record.rank,
      posRank: record.posRank,
      height: record.heightFeet === null || record.heightInches === null
        ? null
        : { feet: record.heightFeet, inches: record.heightInches },
      weight: record.weight,
      playerInfoPublished: record.playerInfoPublished,
      grade: grade ? { ...grade, value: record.gradeValue } : null,
      gradePublished: record.gradePublished,
      writeup: {
        strengths: record.strengths,
        weaknesses: record.weaknesses,
        rundown: record.rundown,
      },
      writeupPublished: record.writeupPublished,
      notes: record.notes,
    };
  }

  private mapBigBoard(record: NonNullable<BigBoardRecord> & {
    entries?: Array<Parameters<PrismaOnDraftRepository["mapBigBoardEntry"]>[0]>;
  }): BigBoard {
    return {
      year: record.year,
      creator: record.creator as BigBoardCreator,
      entries: (record.entries ?? []).map((entry) => this.mapBigBoardEntry(entry)),
    };
  }

  private mapConsensusDiscrepancyWriteup(record: {
    ryanWriteup: string;
    aleksWriteup: string;
    published: boolean;
  }): ConsensusDiscrepancyWriteup {
    return {
      ryanWriteup: record.ryanWriteup,
      aleksWriteup: record.aleksWriteup,
      published: record.published,
    };
  }

  private bigBoardInclude(filter?: DraftBoardFilter) {
    return {
      entries: {
        where: {
          ...(filter?.position ? { position: filter.position } : {}),
          ...(filter?.school ? { school: { equals: filter.school } } : {}),
        },
        orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
      },
    };
  }

  private async findBigBoard(year: number, creator: BigBoardCreator, filter?: DraftBoardFilter): Promise<BigBoard | null> {
    if (creator === "Consensus") {
      return this.generateConsensusBigBoard(year, filter);
    }
    const board = await this.prisma.bigBoard.findUnique({
      where: { year_creator: { year, creator } },
      include: this.bigBoardInclude(filter),
    });
    return board ? this.mapBigBoard(board) : null;
  }

  private async generateConsensusBigBoard(year: number, filter?: DraftBoardFilter): Promise<BigBoard | null> {
    const [ryanBoard, aleksBoard] = await Promise.all([
      this.findBigBoard(year, "Ryan"),
      this.findBigBoard(year, "Aleks"),
    ]);
    if (!ryanBoard && !aleksBoard) {
      const exists = await this.prisma.bigBoard.findFirst({ where: { year } });
      if (!exists) {
        return null;
      }
    }
    const writeups = await this.prisma.consensusDiscrepancyWriteup.findMany({ where: { year } });
    const writeupsByPlayer = new Map(writeups.map((writeup) => [writeup.playerName, this.mapConsensusDiscrepancyWriteup(writeup)]));

    const board = buildConsensusBigBoard({
      year,
      ryanEntries: ryanBoard?.entries ?? [],
      aleksEntries: aleksBoard?.entries ?? [],
      discrepancyWriteupFor: (playerName) => writeupsByPlayer.get(playerName),
    });

    let entries = board.entries;
    if (filter?.position) {
      entries = entries.filter((entry) => entry.position === filter.position);
    }
    if (filter?.school) {
      entries = entries.filter((entry) => entry.school.toLowerCase() === filter.school?.toLowerCase());
    }
    return { year, creator: "Consensus", entries };
  }

  async getSavedSchools(year: number): Promise<Result<string[], BigBoardError>> {
    try {
      const entries = await this.prisma.bigBoardEntry.findMany({
        where: { bigBoard: { year } },
        select: { school: true },
      });

      const schools: string[] = Array.from(
        new Set(entries.map((entry): string => entry.school))
      ).sort((a, b) => a.localeCompare(b));

      return Ok(schools);
    } catch {
      return Err(BigBoardNotFound(`Big boards for ${year} were not found.`));
    }
  }

  async getBigBoard(year: number, creator: BigBoardCreator, filter?: DraftBoardFilter): Promise<Result<BigBoard, BigBoardError>> {
    const board = await this.findBigBoard(year, creator, filter);
    return board ? Ok(board) : Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
  }

  async createBigBoardYear(year: number): Promise<Result<void, BigBoardError>> {
    try {
      const existing = await this.prisma.bigBoard.findFirst({ where: { year } });
      if (existing) {
        return Err(DuplicateBigBoardYear(`Big boards for ${year} already exist.`));
      }
      await this.prisma.bigBoard.createMany({
        data: BIG_BOARD_CREATORS.map((creator) => ({
          id: this.bigBoardId(year, creator),
          year,
          creator,
        })),
      });
      return Ok(undefined);
    } catch {
      return Err(DuplicateBigBoardYear(`Big boards for ${year} already exist.`));
    }
  }

  async deleteBigBoardYear(year: number): Promise<Result<void, BigBoardError>> {
    const deleted = await this.prisma.bigBoard.deleteMany({ where: { year } });
    return deleted.count === 0
      ? Err(BigBoardNotFound(`Big boards for ${year} were not found.`))
      : Ok(undefined);
  }

  async getBigBoardYears(): Promise<Result<number[], BigBoardError>> {
    const boards = await this.prisma.bigBoard.findMany({ select: { year: true } });
    return Ok([...new Set(boards.map((board) => board.year))].sort((first, second) => second - first));
  }

  async getArticles(published = true): Promise<Result<Article[], ArticleError>> {
    const articles = await this.prisma.article.findMany({
      where: { published },
      include: this.articleInclude(),
      orderBy: { createdAt: "asc" },
    });
    return Ok(await Promise.all(articles.map((article) => this.mapArticle(article))));
  }

  async getArticleTags(): Promise<Result<string[], ArticleError>> {
    const tags = await this.prisma.tag.findMany({
      where: { articles: { some: {} } },
      orderBy: { name: "asc" },
    });
    return Ok(tags.map((tag) => tag.name));
  }

  async getFilteredArticles(filter: ArticleFilter): Promise<Result<Article[], ArticleError>> {
    const all = await this.getArticles(filter.published ?? true);
    if (all.ok === false) {
      return all;
    }
    const filtered = all.value.filter((article) => {
      if (filter.author && !article.author.toLowerCase().includes(filter.author.toLowerCase())) return false;
      if (filter.publicationDateRange) {
        const publishedAt = article.publicationDate.getTime();
        if (publishedAt < filter.publicationDateRange.from.getTime() || publishedAt > filter.publicationDateRange.to.getTime()) return false;
      }
      if (filter.keyword) {
        const contentText = article.content.type === "plainText" || article.content.type === "html"
          ? article.content.type === "plainText" ? article.content.text : article.content.body
          : article.content.originalName;
        const searchText = `${article.title} ${article.author} ${article.writeup} ${(article.tags ?? []).join(" ")} ${contentText}`;
        if (!searchText.toLowerCase().includes(filter.keyword.toLowerCase())) return false;
      }
      if (filter.tags && filter.tags.length > 0) {
        const articleTags = (article.tags ?? []).map((tag) => tag.toLowerCase());
        if (!filter.tags.map((tag) => tag.toLowerCase()).every((tag) => articleTags.includes(tag))) return false;
      }
      return true;
    });
    const sortBy = filter.sortBy ?? "date";
    const direction = filter.sortDirection === "asc" ? 1 : -1;
    return Ok([...filtered].sort((first, second) => {
      const firstValue = sortBy === "likes" ? first.likes : sortBy === "comments" ? first.comments.length : first.publicationDate.getTime();
      const secondValue = sortBy === "likes" ? second.likes : sortBy === "comments" ? second.comments.length : second.publicationDate.getTime();
      return (firstValue - secondValue) * direction;
    }));
  }

  async createArticle(article: Article): Promise<Result<Article, ArticleError>> {
    try {
      await this.prisma.article.create({
        data: {
          id: article.id,
          published: article.published,
          title: article.title,
          author: article.author,
          writeup: article.writeup,
          publicationDate: article.publicationDate,
          imageUrl: article.imageUrl,
          ...this.articleContentData(article),
          tags: { create: await this.tagConnections(article.tags ?? []) },
        },
      });
      const created = await this.findArticle(article.id);
      return created ? Ok(created) : Err(ArticleNotFound(`Article with id "${article.id}" not found.`));
    } catch {
      return Err(DuplicateArticle(`Article with id "${article.id}" already exists.`));
    }
  }

  async createBigBoardEntry(year: number, creator: BigBoardCreator, entry: BigBoardEntry): Promise<Result<BigBoardEntry, BigBoardError>> {
    const board = await this.prisma.bigBoard.findUnique({ where: { year_creator: { year, creator } } });
    if (!board) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    try {
      await this.prisma.bigBoardEntry.create({
        data: {
          ...this.bigBoardEntryData(entry),
          bigBoardId: board.id,
          sortOrder: await this.nextBigBoardSortOrder(board.id),
        },
      });
      return Ok(entry);
    } catch {
      return Err(DuplicatePlayer(`Big board entry with id "${entry.id}" already exists in the ${year} ${creator} big board.`));
    }
  }

  private bigBoardEntryData(entry: BigBoardEntry) {
    return {
      id: entry.id,
      playerName: entry.playerName,
      position: entry.position,
      school: entry.school,
      rank: entry.rank,
      posRank: entry.posRank,
      heightFeet: entry.height?.feet ?? null,
      heightInches: entry.height?.inches ?? null,
      weight: entry.weight,
      grade: this.gradeJsonData(entry.grade),
      gradeValue: entry.grade?.value?.trim() ?? "",
      strengths: entry.writeup.strengths,
      weaknesses: entry.writeup.weaknesses,
      rundown: entry.writeup.rundown,
      notes: entry.notes,
      playerInfoPublished: entry.playerInfoPublished,
      gradePublished: entry.gradePublished,
      writeupPublished: entry.writeupPublished,
    };
  }

  private gradeJsonData(grade: DraftGrade | null) {
    if (!grade) {
      return null;
    }
    const { value: _value, ...gradeData } = grade;
    return gradeData;
  }

  private async nextBigBoardSortOrder(bigBoardId: string): Promise<number> {
    const last = await this.prisma.bigBoardEntry.findFirst({
      where: { bigBoardId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  async updateBigBoardEntry(year: number, creator: BigBoardCreator, entry: BigBoardEntry): Promise<Result<BigBoardEntry, BigBoardError>> {
    const board = await this.prisma.bigBoard.findUnique({ where: { year_creator: { year, creator } } });
    if (!board) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    try {
      const updated = await this.prisma.bigBoardEntry.update({
        where: { id: entry.id },
        data: this.bigBoardEntryData(entry),
      });
      return Ok(this.mapBigBoardEntry(updated));
    } catch {
      return Err(PlayerNotFound(`Big board entry with id "${entry.id}" was not found in the ${year} ${creator} big board.`));
    }
  }

  async replaceBigBoardEntries(year: number, creator: BigBoardCreator, entries: BigBoardEntry[]): Promise<Result<BigBoard, BigBoardError>> {
    const board = await this.prisma.bigBoard.findUnique({ where: { year_creator: { year, creator } } });
    if (!board) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    await this.prisma.bigBoard.update({
      where: { id: board.id },
      data: {
        entries: {
          deleteMany: {},
          create: entries.map((entry, index) => ({
            ...this.bigBoardEntryData(entry),
            sortOrder: index,
          })),
        },
      },
    });
    const updated = await this.findBigBoard(year, creator);
    return updated ? Ok(updated) : Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
  }

  async deleteArticle(id: string): Promise<Result<void, ArticleError>> {
    try {
      await this.prisma.article.delete({ where: { id } });
      return Ok(undefined);
    } catch {
      return Err(ArticleNotFound(`Article with id "${id}" not found.`));
    }
  }

  async deleteBigBoardEntry(year: number, creator: BigBoardCreator, playerName: string): Promise<Result<void, BigBoardError>> {
    const board = await this.prisma.bigBoard.findUnique({ where: { year_creator: { year, creator } } });
    if (!board) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    const deleted = await this.prisma.bigBoardEntry.deleteMany({ where: { bigBoardId: board.id, playerName } });
    return deleted.count === 0
      ? Err(PlayerNotFound(`Player with name "${playerName}" not found in the ${year} ${creator} big board.`))
      : Ok(undefined);
  }

  async getBigBoardEntry(year: number, creator: BigBoardCreator, playerName: string): Promise<Result<BigBoardEntry, BigBoardError>> {
    const board = await this.prisma.bigBoard.findUnique({ where: { year_creator: { year, creator } } });
    if (!board) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    const entry = await this.prisma.bigBoardEntry.findFirst({ where: { bigBoardId: board.id, playerName } });
    return entry ? Ok(this.mapBigBoardEntry(entry)) : Err(PlayerNotFound(`Player with name "${playerName}" not found in the ${year} ${creator} big board.`));
  }

  async getBigBoardEntryById(year: number, creator: BigBoardCreator, entryId: string): Promise<Result<BigBoardEntry, BigBoardError>> {
    const board = await this.prisma.bigBoard.findUnique({ where: { year_creator: { year, creator } } });
    if (!board) {
      return Err(BigBoardNotFound(`Big board for ${year} by ${creator} was not found.`));
    }
    const entry = await this.prisma.bigBoardEntry.findFirst({ where: { bigBoardId: board.id, id: entryId } });
    return entry ? Ok(this.mapBigBoardEntry(entry)) : Err(PlayerNotFound(`Big board entry with id "${entryId}" was not found in the ${year} ${creator} big board.`));
  }

  async getArticle(id: string): Promise<Result<Article, ArticleError>> {
    const article = await this.findArticle(id);
    return article ? Ok(article) : Err(ArticleNotFound(`Article with id "${id}" not found.`));
  }

  async updateArticle(article: Article): Promise<Result<Article, ArticleError>> {
    const existing = await this.prisma.article.findUnique({ where: { id: article.id } });
    if (!existing) {
      return Err(ArticleNotFound(`Article with id "${article.id}" not found.`));
    }
    await this.prisma.$transaction([
      this.prisma.articleTag.deleteMany({ where: { articleId: article.id } }),
      this.prisma.article.update({
        where: { id: article.id },
        data: {
          published: article.published,
          title: article.title,
          author: article.author,
          writeup: article.writeup,
          publicationDate: article.publicationDate,
          imageUrl: article.imageUrl,
          ...this.articleContentData(article),
          tags: { create: await this.tagConnections(article.tags ?? []) },
        },
      }),
    ]);
    const updated = await this.findArticle(article.id);
    return updated ? Ok(updated) : Err(ArticleNotFound(`Article with id "${article.id}" not found.`));
  }

  async commentByArticleId(articleId: string, comment: Comment): Promise<Result<Comment, ArticleError>> {
    const article = await this.prisma.article.findUnique({ where: { id: articleId } });
    if (!article) {
      return Err(ArticleNotFound(`Article with id "${articleId}" not found.`));
    }
    const created = await this.prisma.comment.create({
      data: {
        id: comment.id,
        articleId,
        userId: comment.userId,
        userName: comment.userName,
        text: comment.text,
        createdAt: comment.createdAt,
      },
      include: { likes: true },
    });
    return Ok(this.mapComment(created));
  }

  async commentReplyByCommentId(commentId: string, reply: Comment): Promise<Result<Comment, ArticleError>> {
    const parent = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!parent) {
      return Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
    }
    const created = await this.prisma.comment.create({
      data: {
        id: reply.id,
        articleId: parent.articleId,
        parentCommentId: commentId,
        userId: reply.userId,
        userName: reply.userName,
        text: reply.text,
        createdAt: reply.createdAt,
      },
      include: { likes: true },
    });
    return Ok(this.mapComment(created));
  }

  async likeByArticleId(articleId: string, userId: string): Promise<Result<Article, ArticleError>> {
    const article = await this.prisma.article.findUnique({ where: { id: articleId } });
    if (!article) return Err(ArticleNotFound(`Article with id "${articleId}" not found.`));
    const existing = await this.prisma.articleLike.findUnique({ where: { articleId_actorId: { articleId, actorId: userId } } });
    if (existing) {
      await this.prisma.articleLike.delete({ where: { articleId_actorId: { articleId, actorId: userId } } });
    } else {
      await this.prisma.articleLike.create({ data: { articleId, actorId: userId } });
    }
    const updated = await this.findArticle(articleId);
    return updated ? Ok(updated) : Err(ArticleNotFound(`Article with id "${articleId}" not found.`));
  }

  async likeByCommentId(commentId: string, userId: string): Promise<Result<Comment, ArticleError>> {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
    const existing = await this.prisma.commentLike.findUnique({ where: { commentId_actorId: { commentId, actorId: userId } } });
    if (existing) {
      await this.prisma.commentLike.delete({ where: { commentId_actorId: { commentId, actorId: userId } } });
    } else {
      await this.prisma.commentLike.create({ data: { commentId, actorId: userId } });
    }
    const updated = await this.prisma.comment.findUnique({ where: { id: commentId }, include: { likes: { orderBy: { createdAt: "asc" } } } });
    return updated ? Ok(this.mapComment(updated)) : Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
  }

  async deleteComment(commentId: string): Promise<Result<void, ArticleError>> {
    try {
      await this.prisma.comment.delete({ where: { id: commentId } });
      return Ok(undefined);
    } catch {
      return Err(CommentNotFound(`Comment with id "${commentId}" not found.`));
    }
  }

  async createForumPost(post: ForumPost): Promise<Result<ForumPost, ForumPostError>> {
    try {
      await this.prisma.forumPost.create({
        data: {
          id: post.id,
          userId: post.userId,
          userName: post.userName,
          content: post.content,
          createdAt: post.createdAt,
        },
      });
      const created = await this.getForumPost(post.id);
      return created;
    } catch {
      return Err(DuplicateForumPost(`Hot take with id "${post.id}" already exists.`));
    }
  }

  private async mapForumPost(record: NonNullable<ForumPostRecord> & {
    likes?: Array<{ actorId: string }>;
    comments?: Array<{
      id: string;
      userId: string;
      userName: string;
      text: string;
      createdAt: Date;
    }>;
  }): Promise<ForumPost> {
    const likedByUserIds = (record.likes ?? []).map((like) => like.actorId);
    return {
      id: record.id,
      userId: record.userId,
      userName: record.userName,
      content: record.content,
      createdAt: record.createdAt,
      likes: likedByUserIds.length,
      likedByUserIds,
      comments: (record.comments ?? []).map((comment) => ({
        id: comment.id,
        userId: comment.userId,
        userName: comment.userName,
        text: comment.text,
        createdAt: comment.createdAt,
        likes: 0,
        likedByUserIds: [],
        replies: [],
      })),
    };
  }

  private forumPostInclude() {
    return {
      likes: { orderBy: { createdAt: "asc" as const } },
      comments: { orderBy: { createdAt: "asc" as const } },
    };
  }

  async getForumPosts(): Promise<Result<ForumPost[], ForumPostError>> {
    const posts = await this.prisma.forumPost.findMany({
      include: this.forumPostInclude(),
      orderBy: { createdAt: "desc" },
    });
    return Ok(await Promise.all(posts.map((post) => this.mapForumPost(post))));
  }

  async getForumPost(postId: string): Promise<Result<ForumPost, ForumPostError>> {
    const post = await this.prisma.forumPost.findUnique({
      where: { id: postId },
      include: this.forumPostInclude(),
    });
    return post ? Ok(await this.mapForumPost(post)) : Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
  }

  async likeByForumPostId(postId: string, userId: string): Promise<Result<ForumPost, ForumPostError>> {
    const post = await this.prisma.forumPost.findUnique({ where: { id: postId } });
    if (!post) return Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
    const existing = await this.prisma.forumPostLike.findUnique({ where: { forumPostId_actorId: { forumPostId: postId, actorId: userId } } });
    if (existing) {
      await this.prisma.forumPostLike.delete({ where: { forumPostId_actorId: { forumPostId: postId, actorId: userId } } });
    } else {
      await this.prisma.forumPostLike.create({ data: { forumPostId: postId, actorId: userId } });
    }
    return this.getForumPost(postId);
  }

  async commentByForumPostId(postId: string, comment: Comment): Promise<Result<Comment, ForumPostError>> {
    const post = await this.prisma.forumPost.findUnique({ where: { id: postId } });
    if (!post) return Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
    await this.prisma.forumPostComment.create({
      data: {
        id: comment.id,
        forumPostId: postId,
        userId: comment.userId,
        userName: comment.userName,
        text: comment.text,
        createdAt: comment.createdAt,
      },
    });
    return Ok({ ...comment, likes: 0, likedByUserIds: [], replies: [] });
  }

  async deleteForumPostComment(commentId: string): Promise<Result<void, ForumPostError>> {
    try {
      await this.prisma.forumPostComment.delete({ where: { id: commentId } });
      return Ok(undefined);
    } catch {
      return Err(ForumPostCommentNotFound(`Comment with id "${commentId}" not found.`));
    }
  }

  async getFilteredForumPosts(filter: ForumPostFilter): Promise<Result<ForumPost[], ForumPostError>> {
    const all = await this.getForumPosts();
    if (all.ok === false) return all;
    const filtered = all.value.filter((post) => {
      if (filter.userId && post.userId !== filter.userId) return false;
      if (filter.keyword) {
        const searchText = `${post.userName} ${post.content} ${post.comments.map((comment) => comment.text).join(" ")}`;
        if (!searchText.toLowerCase().includes(filter.keyword.toLowerCase())) return false;
      }
      if (filter.dateRange) {
        const createdAt = post.createdAt.getTime();
        if (createdAt < filter.dateRange.from.getTime() || createdAt > filter.dateRange.to.getTime()) return false;
      }
      return true;
    });
    const sortBy = filter.sortBy ?? "date";
    const direction = filter.sortDirection === "asc" ? 1 : -1;
    return Ok([...filtered].sort((first, second) => {
      const firstValue = sortBy === "likes" ? first.likes : sortBy === "comments" ? first.comments.length : first.createdAt.getTime();
      const secondValue = sortBy === "likes" ? second.likes : sortBy === "comments" ? second.comments.length : second.createdAt.getTime();
      return (firstValue - secondValue) * direction;
    }));
  }

  async deleteForumPost(postId: string): Promise<Result<void, ForumPostError>> {
    try {
      await this.prisma.forumPost.delete({ where: { id: postId } });
      return Ok(undefined);
    } catch {
      return Err(ForumPostNotFound(`Hot take with id "${postId}" not found.`));
    }
  }

  private mapVideo(record: NonNullable<VideoRecord> & { tags?: Array<{ tag: { name: string } }> }): Video {
    return {
      youtubeUrl: record.youtubeUrl,
      title: record.title,
      description: record.description,
      videoId: record.videoId,
      tags: (record.tags ?? []).map((entry) => entry.tag.name),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      thumbnailUrl: record.thumbnailUrl ?? undefined,
      viewCount: record.viewCount ?? undefined,
      youtubeStatsFetchedAt: record.youtubeStatsFetchedAt ?? undefined,
    };
  }

  private videoInclude() {
    return { tags: { include: { tag: true } } };
  }

  async createYoutubeVideo(video: Video): Promise<Result<Video, ArticleError>> {
    try {
      await this.prisma.video.create({
        data: {
          videoId: video.videoId,
          youtubeUrl: video.youtubeUrl,
          title: video.title,
          description: video.description,
          thumbnailUrl: video.thumbnailUrl,
          viewCount: video.viewCount,
          youtubeStatsFetchedAt: video.youtubeStatsFetchedAt,
          createdAt: video.createdAt,
          updatedAt: video.updatedAt,
          tags: { create: await this.tagConnections(video.tags) },
        },
      });
      const created = await this.prisma.video.findUnique({ where: { videoId: video.videoId }, include: this.videoInclude() });
      return created ? Ok(this.mapVideo(created)) : Err(ArticleNotFound(`YouTube video with id "${video.videoId}" not found.`));
    } catch {
      return Err(DuplicateArticle(`YouTube video with id "${video.videoId}" already exists.`));
    }
  }

  async getYoutubeVideo(videoId: string): Promise<Result<Video, ArticleError>> {
    const video = await this.prisma.video.findUnique({ where: { videoId }, include: this.videoInclude() });
    return video ? Ok(this.mapVideo(video)) : Err(ArticleNotFound(`YouTube video with id "${videoId}" not found.`));
  }

  async getYoutubeVideos(): Promise<Result<Video[], ArticleError>> {
    const videos = await this.prisma.video.findMany({
      include: this.videoInclude(),
      orderBy: { createdAt: "desc" },
    });
    return Ok(videos.map((video) => this.mapVideo(video)));
  }

  async getVideoTags(): Promise<Result<string[], ArticleError>> {
    const tags = await this.prisma.tag.findMany({
      where: { videos: { some: {} } },
      orderBy: { name: "asc" },
    });
    return Ok(tags.map((tag) => tag.name));
  }

  async filterYoutubeVideos(query: VideoQuery): Promise<Result<Video[], ArticleError>> {
    const all = await this.getYoutubeVideos();
    if (all.ok === false) return all;
    const filtered = all.value.filter((video) => {
      if (query.keyword) {
        const searchText = `${video.title} ${video.description} ${video.tags.join(" ")}`;
        if (!searchText.toLowerCase().includes(query.keyword.toLowerCase())) return false;
      }
      if (query.tags && query.tags.length > 0) {
        const videoTags = video.tags.map((tag) => tag.toLowerCase());
        if (!query.tags.map((tag) => tag.toLowerCase()).every((tag) => videoTags.includes(tag))) return false;
      }
      if (query.dateRange) {
        const createdAt = video.createdAt.getTime();
        if (createdAt < query.dateRange.from.getTime() || createdAt > query.dateRange.to.getTime()) return false;
      }
      return true;
    });
    const sortBy = query.sortBy ?? "date";
    const direction = query.sortDirection === "asc" ? 1 : -1;
    return Ok([...filtered].sort((first, second) => {
      const firstValue = sortBy === "popularity" ? first.viewCount ?? 0 : first.createdAt.getTime();
      const secondValue = sortBy === "popularity" ? second.viewCount ?? 0 : second.createdAt.getTime();
      return (firstValue - secondValue) * direction;
    }));
  }

  async updateYoutubeVideo(videoId: string, video: Video): Promise<Result<Video, ArticleError>> {
    try {
      const existing = await this.prisma.video.findUnique({ where: { videoId } });
      if (!existing) {
        return Err(ArticleNotFound(`YouTube video with id "${videoId}" not found.`));
      }

      const updated = await this.prisma.video.update({
        where: { videoId },
        data: {
          videoId: video.videoId,
          youtubeUrl: video.youtubeUrl,
          title: video.title,
          description: video.description,
          thumbnailUrl: video.thumbnailUrl,
          viewCount: video.viewCount,
          youtubeStatsFetchedAt: video.youtubeStatsFetchedAt,
          createdAt: video.createdAt,
          updatedAt: video.updatedAt,
          tags: {
            deleteMany: {},
            create: await this.tagConnections(video.tags),
          },
        },
        include: this.videoInclude(),
      });
      return Ok(this.mapVideo(updated));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return message.includes("Unique constraint")
        ? Err(DuplicateArticle(`YouTube video with id "${video.videoId}" already exists.`))
        : Err(ArticleNotFound(`YouTube video with id "${videoId}" not found.`));
    }
  }

  async updateYoutubeVideoStats(videoId: string, stats: { thumbnailUrl?: string; viewCount?: number; youtubeStatsFetchedAt: Date }): Promise<Result<Video, ArticleError>> {
    try {
      const updated = await this.prisma.video.update({
        where: { videoId },
        data: {
          thumbnailUrl: stats.thumbnailUrl,
          viewCount: stats.viewCount,
          youtubeStatsFetchedAt: stats.youtubeStatsFetchedAt,
          updatedAt: new Date(),
        },
        include: this.videoInclude(),
      });
      return Ok(this.mapVideo(updated));
    } catch {
      return Err(ArticleNotFound(`YouTube video with id "${videoId}" not found.`));
    }
  }

  async deleteYoutubeVideo(videoId: string): Promise<Result<void, ArticleError>> {
    try {
      await this.prisma.video.delete({ where: { videoId } });
      return Ok(undefined);
    } catch {
      return Err(ArticleNotFound(`YouTube video with id "${videoId}" not found.`));
    }
  }

  async getTags(): Promise<Result<string[], ArticleError>> {
    const tags = await this.prisma.tag.findMany({ orderBy: { name: "asc" } });
    return Ok(tags.map((tag) => tag.name));
  }

  async getConsensusBigBoard(year: number): Promise<Result<ConsensusBigBoard, BigBoardError>> {
    const board = await this.generateConsensusBigBoard(year);
    if (!board) {
      return Err(BigBoardNotFound(`Big board for ${year} was not found.`));
    }
    return Ok({
      year: board.year,
      entries: board.entries.map((entry) => ({
        playerName: entry.playerName,
        position: entry.position as ConsensusBigBoard["entries"][number]["position"],
        school: entry.school,
        rank: entry.rank,
        posRank: entry.posRank,
        height: entry.height,
        weight: entry.weight,
        bigDiscrepency: entry.bigDiscrepency ?? false,
        discWriteup: entry.discWriteup,
        consensusRankingContext: entry.consensusRankingContext,
      })),
    });
  }

  async getConsensusDiscrepancyWriteup(year: number, playerName: string): Promise<Result<ConsensusDiscrepancyWriteup, BigBoardError>> {
    try {
      const writeup = await this.prisma.consensusDiscrepancyWriteup.findUnique({
        where: { year_playerName: { year, playerName } },
      });
      return writeup
        ? Ok(this.mapConsensusDiscrepancyWriteup(writeup))
        : Err(PlayerNotFound(`Consensus discrepancy writeup for ${playerName} in ${year} was not found.`));
    } catch {
      return Err(PlayerNotFound(`Consensus discrepancy writeup for ${playerName} in ${year} was not found.`));
    }
  }

  async saveConsensusDiscrepancyWriteup(year: number, playerName: string, writeup: ConsensusDiscrepancyWriteup): Promise<Result<ConsensusDiscrepancyWriteup, BigBoardError>> {
    try {
      const updated = await this.prisma.consensusDiscrepancyWriteup.upsert({
        where: { year_playerName: { year, playerName } },
        create: {
          id: `${year}:${playerName}`,
          year,
          playerName,
          ryanWriteup: writeup.ryanWriteup,
          aleksWriteup: writeup.aleksWriteup,
          published: writeup.published,
        },
        update: {
          ryanWriteup: writeup.ryanWriteup,
          aleksWriteup: writeup.aleksWriteup,
          published: writeup.published,
        },
      });
      return Ok(this.mapConsensusDiscrepancyWriteup(updated));
    } catch {
      return Err(PlayerNotFound(`Consensus discrepancy writeup for ${playerName} in ${year} could not be saved.`));
    }
  }

  async publishConsensusDiscrepancyWriteup(year: number, playerName: string): Promise<Result<ConsensusDiscrepancyWriteup, BigBoardError>> {
    try {
      const updated = await this.prisma.consensusDiscrepancyWriteup.update({
        where: { year_playerName: { year, playerName } },
        data: { published: true },
      });
      return Ok(this.mapConsensusDiscrepancyWriteup(updated));
    } catch {
      return Err(PlayerNotFound(`Consensus discrepancy writeup for ${playerName} in ${year} was not found.`));
    }
  }

  private mapNewsletter(record: NonNullable<NewsletterRecord>): Newsletter {
    return {
      id: record.id,
      date: record.date,
      writeup: record.writeup,
      articleIds: [...record.articleIds],
      videoIds: [...record.videoIds],
      changelog: record.changelog,
      status: record.status === "sent" ? "sent" : "draft",
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      sentAt: record.sentAt ?? undefined,
      recipientCount: record.recipientCount,
    };
  }

  private newsletterData(newsletter: Newsletter) {
    return {
      date: newsletter.date,
      writeup: newsletter.writeup,
      articleIds: newsletter.articleIds,
      videoIds: newsletter.videoIds,
      changelog: newsletter.changelog,
      status: newsletter.status,
      recipientCount: newsletter.recipientCount,
      sentAt: newsletter.sentAt ?? null,
      createdAt: newsletter.createdAt,
      updatedAt: newsletter.updatedAt,
    };
  }

  async createNewsletter(newsletter: Newsletter): Promise<Result<Newsletter, NewsletterError>> {
    try {
      const created = await this.prisma.newsletter.create({
        data: {
          id: newsletter.id,
          ...this.newsletterData(newsletter),
        },
      });
      return Ok(this.mapNewsletter(created));
    } catch {
      return Err(DuplicateNewsletter(`Newsletter with id "${newsletter.id}" already exists.`));
    }
  }

  async updateNewsletter(newsletter: Newsletter): Promise<Result<Newsletter, NewsletterError>> {
    try {
      const updated = await this.prisma.newsletter.update({
        where: { id: newsletter.id },
        data: this.newsletterData(newsletter),
      });
      return Ok(this.mapNewsletter(updated));
    } catch {
      return Err(NewsletterNotFound(`Newsletter with id "${newsletter.id}" not found.`));
    }
  }

  async getNewsletter(id: string): Promise<Result<Newsletter, NewsletterError>> {
    const newsletter = await this.prisma.newsletter.findUnique({ where: { id } });
    return newsletter
      ? Ok(this.mapNewsletter(newsletter))
      : Err(NewsletterNotFound(`Newsletter with id "${id}" not found.`));
  }

  async listNewsletters(): Promise<Result<Newsletter[], NewsletterError>> {
    const newsletters = await this.prisma.newsletter.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return Ok(newsletters.map((newsletter) => this.mapNewsletter(newsletter)));
  }

  async countDistinctBigBoardPlayers(): Promise<Result<number, BigBoardError>> {
    const groups = await this.prisma.bigBoardEntry.groupBy({ by: ["playerName"] });
    return Ok(groups.length);
  }

  async countPublishedArticles(): Promise<Result<number, ArticleError>> {
    return Ok(await this.prisma.article.count({ where: { published: true } }));
  }

  async countForumPosts(): Promise<Result<number, ForumPostError>> {
    return Ok(await this.prisma.forumPost.count());
  }

  async getAppSetting(key: string): Promise<Result<string | null, BigBoardError>> {
    const setting = await this.prisma.appSetting.findUnique({ where: { key } });
    return Ok(setting?.value ?? null);
  }

  async setAppSetting(key: string, value: string): Promise<Result<void, BigBoardError>> {
    await this.prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    return Ok(undefined);
  }

  // v2.1 c8-search
  async searchArticles(term: string, limit: number): Promise<Result<Article[], ArticleError>> {
    try {
      const records = await this.prisma.article.findMany({
        where: {
          published: true,
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { author: { contains: term, mode: "insensitive" } },
            { writeup: { contains: term, mode: "insensitive" } },
            { plainText: { contains: term, mode: "insensitive" } },
          ],
        },
        include: this.articleInclude(),
        orderBy: { publicationDate: "desc" },
        take: limit,
      });
      return Ok(await Promise.all(records.map((record) => this.mapArticle(record))));
    } catch {
      return Err(DatabaseError("Failed to search articles.") as ArticleError);
    }
  }

  async searchYoutubeVideos(term: string, limit: number): Promise<Result<Video[], ArticleError>> {
    try {
      const records = await this.prisma.video.findMany({
        where: { title: { contains: term, mode: "insensitive" } },
        include: this.videoInclude(),
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return Ok(records.map((record) => this.mapVideo(record)));
    } catch {
      return Err(DatabaseError("Failed to search videos.") as ArticleError);
    }
  }

  async searchForumPosts(term: string, limit: number): Promise<Result<ForumPost[], ForumPostError>> {
    try {
      const records = await this.prisma.forumPost.findMany({
        where: { content: { contains: term, mode: "insensitive" } },
        include: this.forumPostInclude(),
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return Ok(await Promise.all(records.map((record) => this.mapForumPost(record))));
    } catch {
      return Err(DatabaseError("Failed to search hot takes.") as ForumPostError);
    }
  }

  async searchBigBoardPlayers(term: string, limit: number): Promise<Result<BigBoardPlayerSearchHit[], BigBoardError>> {
    try {
      const records = await this.prisma.bigBoardEntry.findMany({
        where: {
          playerInfoPublished: true,
          bigBoard: { creator: { in: ["Ryan", "Aleks"] } },
          OR: [
            { playerName: { contains: term, mode: "insensitive" } },
            { position: { contains: term, mode: "insensitive" } },
            { school: { contains: term, mode: "insensitive" } },
          ],
        },
        select: {
          playerName: true,
          position: true,
          school: true,
          rank: true,
          posRank: true,
          bigBoard: { select: { year: true } },
        },
        orderBy: [
          { bigBoard: { year: "desc" } },
          { rank: { sort: "asc", nulls: "last" } },
        ],
        take: 200,
      });
      const seen = new Set<string>();
      const hits: BigBoardPlayerSearchHit[] = [];
      for (const record of records) {
        const key = `${record.bigBoard.year}:${record.playerName.toLowerCase()}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        hits.push({
          playerName: record.playerName,
          position: record.position as Position | "",
          school: record.school,
          year: record.bigBoard.year,
          rank: record.rank,
          posRank: record.posRank,
        });
      }
      return Ok(hits.slice(0, limit));
    } catch {
      return Err(DatabaseError("Failed to search draft board players.") as BigBoardError);
    }
  }
}

export function CreatePrismaOnDraftRepository(prisma?: OnDraftPrismaClient): IOnDraftRepository {
  return new PrismaOnDraftRepository(prisma);
}
