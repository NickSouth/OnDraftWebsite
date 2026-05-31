import { randomUUID } from "node:crypto";
import { Err, Ok, type Result } from "../lib/result";
import { getPrismaClient, type OnDraftPrismaClient } from "../prisma/client";
import { UnexpectedDependencyError, type AuthError } from "./errors";
import type {
  BanUserInput,
  CreateEmailVerificationTokenInput,
  CreatePasswordResetTokenInput,
  IUserRepository,
  UpsertMailingListSubscriptionInput,
} from "./UserRepository";
import type {
  Bookmark,
  IEmailVerificationTokenRecord,
  IMailingListSubscriptionRecord,
  IPasswordResetTokenRecord,
  IUserBanRecord,
  IUserRecord,
  UserPreferences,
} from "./User";

type UserWithRelations = Awaited<ReturnType<OnDraftPrismaClient["user"]["findUnique"]>>;

class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: OnDraftPrismaClient = getPrismaClient()) {}

  private iso(value: Date | string | null): string | null {
    if (!value) {
      return null;
    }
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private mapBan(ban: {
    message: string;
    bannedAt: Date;
    expiresAt: Date | null;
    bannedByUserId: string;
  } | null | undefined): IUserBanRecord | null {
    if (!ban) {
      return null;
    }
    return {
      message: ban.message,
      bannedAt: ban.bannedAt.toISOString(),
      expiresAt: ban.expiresAt?.toISOString() ?? null,
      bannedByUserId: ban.bannedByUserId,
    };
  }

  private mapBookmark(bookmark: { type: string; articleId: string | null; forumPostId: string | null }): Bookmark | null {
    if (bookmark.type === "article" && bookmark.articleId) {
      return { type: "article", articleId: bookmark.articleId };
    }
    if (bookmark.type === "forumPost" && bookmark.forumPostId) {
      return { type: "forumPost", forumPostId: bookmark.forumPostId };
    }
    return null;
  }

  private async findUserRecord(where: { id: string } | { email: string }): Promise<IUserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where,
      include: {
        bans: {
          where: { liftedAt: null },
          orderBy: { bannedAt: "desc" },
          take: 1,
        },
        bookmarks: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return user ? this.mapUser(user) : null;
  }

  private mapUser(user: NonNullable<UserWithRelations> & {
    bans?: Array<{
      message: string;
      bannedAt: Date;
      expiresAt: Date | null;
      bannedByUserId: string;
    }>;
    bookmarks?: Array<{ type: string; articleId: string | null; forumPostId: string | null }>;
  }): IUserRecord {
    const bookmarks = (user.bookmarks ?? [])
      .map((bookmark) => this.mapBookmark(bookmark))
      .filter((bookmark): bookmark is Bookmark => bookmark !== null);
    return {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      displayName: user.displayName,
      password: user.passwordHash,
      role: user.role as IUserRecord["role"],
      ban: this.mapBan(user.bans?.[0]),
      createdAt: user.createdAt.toISOString(),
      preferences: {
        theme: user.theme as UserPreferences["theme"],
        fontSize: user.fontSize as UserPreferences["fontSize"],
        bookmarks,
      },
    };
  }

  private mapEmailVerificationToken(token: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
    createdAt: Date;
  }): IEmailVerificationTokenRecord {
    return {
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt.toISOString(),
      usedAt: token.usedAt?.toISOString() ?? null,
      createdAt: token.createdAt.toISOString(),
    };
  }

  private mapPasswordResetToken(token: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
    createdAt: Date;
  }): IPasswordResetTokenRecord {
    return {
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt.toISOString(),
      usedAt: token.usedAt?.toISOString() ?? null,
      createdAt: token.createdAt.toISOString(),
    };
  }

  private mapMailingListSubscription(subscription: {
    id: string;
    email: string;
    userId: string | null;
    status: string;
    consentSource: string;
    consentTextVersion: string;
    consentedAt: Date | null;
    unsubscribedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): IMailingListSubscriptionRecord {
    return {
      id: subscription.id,
      email: subscription.email,
      userId: subscription.userId,
      status: subscription.status as IMailingListSubscriptionRecord["status"],
      consentSource: subscription.consentSource,
      consentTextVersion: subscription.consentTextVersion,
      consentedAt: subscription.consentedAt?.toISOString() ?? null,
      unsubscribedAt: subscription.unsubscribedAt?.toISOString() ?? null,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
    };
  }

  async add(user: IUserRecord): Promise<Result<IUserRecord, AuthError>> {
    try {
      await this.prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          emailVerifiedAt: this.iso(user.emailVerifiedAt),
          displayName: user.displayName,
          passwordHash: user.password,
          role: user.role,
          theme: user.preferences.theme,
          fontSize: user.preferences.fontSize,
          createdAt: new Date(user.createdAt),
          bookmarks: {
            create: user.preferences.bookmarks.map((bookmark) => ({
              id: randomUUID(),
              type: bookmark.type,
              articleId: bookmark.type === "article" ? bookmark.articleId : null,
              forumPostId: bookmark.type === "forumPost" ? bookmark.forumPostId : null,
            })),
          },
          bans: user.ban ? {
            create: {
              id: randomUUID(),
              message: user.ban.message,
              bannedAt: new Date(user.ban.bannedAt),
              expiresAt: this.iso(user.ban.expiresAt),
              bannedByUserId: user.ban.bannedByUserId,
            },
          } : undefined,
        },
      });
      const created = await this.findUserRecord({ id: user.id });
      return created ? Ok(created) : Err(UnexpectedDependencyError("Unable to save the user."));
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the user."));
    }
  }

  async deleteUser(userId: string): Promise<Result<void, AuthError>> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      await this.prisma.$transaction([
        this.prisma.mailingListSubscription.deleteMany({ where: { userId } }),
        this.prisma.user.delete({ where: { id: userId } }),
      ]);
      return Ok(undefined);
    } catch {
      return Err(UnexpectedDependencyError("Unable to delete the user."));
    }
  }

  async listUsers(): Promise<Result<IUserRecord[], AuthError>> {
    try {
      const users = await this.prisma.user.findMany({
        include: {
          bans: { where: { liftedAt: null }, orderBy: { bannedAt: "desc" }, take: 1 },
          bookmarks: { orderBy: { createdAt: "asc" } },
        },
      });
      return Ok(users.map((user) => this.mapUser(user)));
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the users."));
    }
  }

  async findById(userId: string): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      return Ok(await this.findUserRecord({ id: userId }));
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the user."));
    }
  }

  async findByEmail(email: string): Promise<Result<IUserRecord | null, AuthError>> {
    try {
      return Ok(await this.findUserRecord({ email }));
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the users."));
    }
  }

  async banUser(input: BanUserInput): Promise<Result<IUserRecord, AuthError>> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      await this.prisma.userBan.updateMany({
        where: { userId: input.userId, liftedAt: null },
        data: { liftedAt: new Date(input.bannedAt) },
      });
      await this.prisma.userBan.create({
        data: {
          id: randomUUID(),
          userId: input.userId,
          message: input.message,
          bannedAt: new Date(input.bannedAt),
          expiresAt: this.iso(input.expiresAt),
          bannedByUserId: input.bannedByUserId,
        },
      });
      const updated = await this.findUserRecord({ id: input.userId });
      return updated ? Ok(updated) : Err(UnexpectedDependencyError("Unable to ban the user."));
    } catch {
      return Err(UnexpectedDependencyError("Unable to ban the user."));
    }
  }

  async unbanUser(userId: string): Promise<Result<IUserRecord, AuthError>> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      await this.prisma.userBan.updateMany({
        where: { userId, liftedAt: null },
        data: { liftedAt: new Date() },
      });
      const updated = await this.findUserRecord({ id: userId });
      return updated ? Ok(updated) : Err(UnexpectedDependencyError("Unable to unban the user."));
    } catch {
      return Err(UnexpectedDependencyError("Unable to unban the user."));
    }
  }

  async getPreferences(userId: string): Promise<Result<UserPreferences, AuthError>> {
    try {
      const user = await this.findUserRecord({ id: userId });
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      return Ok(user.preferences);
    } catch {
      return Err(UnexpectedDependencyError("Unable to retrieve user preferences."));
    }
  }

  async setEmailVerified(userId: string, verifiedAt: string): Promise<Result<IUserRecord, AuthError>> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date(verifiedAt) },
      });
      const updated = await this.findUserRecord({ id: userId });
      return updated ? Ok(updated) : Err(UnexpectedDependencyError("User not found."));
    } catch {
      return Err(UnexpectedDependencyError("Unable to verify the user email."));
    }
  }

  async updatePassword(userId: string, passwordHash: string): Promise<Result<IUserRecord, AuthError>> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      const updated = await this.findUserRecord({ id: userId });
      return updated ? Ok(updated) : Err(UnexpectedDependencyError("User not found."));
    } catch {
      return Err(UnexpectedDependencyError("Unable to update the user password."));
    }
  }

  async addEmailVerificationToken(
    token: CreateEmailVerificationTokenInput,
  ): Promise<Result<IEmailVerificationTokenRecord, AuthError>> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: token.userId } });
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      const created = await this.prisma.emailVerificationToken.create({
        data: {
          id: token.id,
          userId: token.userId,
          tokenHash: token.tokenHash,
          expiresAt: new Date(token.expiresAt),
          createdAt: new Date(token.createdAt),
        },
      });
      return Ok(this.mapEmailVerificationToken(created));
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the email verification token."));
    }
  }

  async findEmailVerificationTokenByHash(
    tokenHash: string,
  ): Promise<Result<IEmailVerificationTokenRecord | null, AuthError>> {
    try {
      const token = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
      return Ok(token ? this.mapEmailVerificationToken(token) : null);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the email verification token."));
    }
  }

  async markEmailVerificationTokenUsed(
    tokenId: string,
    usedAt: string,
  ): Promise<Result<IEmailVerificationTokenRecord, AuthError>> {
    try {
      const updated = await this.prisma.emailVerificationToken.update({
        where: { id: tokenId },
        data: { usedAt: new Date(usedAt) },
      });
      return Ok(this.mapEmailVerificationToken(updated));
    } catch {
      return Err(UnexpectedDependencyError("Unable to update the email verification token."));
    }
  }

  async markUnusedEmailVerificationTokensUsedForUser(
    userId: string,
    usedAt: string,
  ): Promise<Result<void, AuthError>> {
    try {
      await this.prisma.emailVerificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date(usedAt) },
      });
      return Ok(undefined);
    } catch {
      return Err(UnexpectedDependencyError("Unable to update the email verification tokens."));
    }
  }

  async addPasswordResetToken(
    token: CreatePasswordResetTokenInput,
  ): Promise<Result<IPasswordResetTokenRecord, AuthError>> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: token.userId } });
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      const created = await this.prisma.passwordResetToken.create({
        data: {
          id: token.id,
          userId: token.userId,
          tokenHash: token.tokenHash,
          expiresAt: new Date(token.expiresAt),
          createdAt: new Date(token.createdAt),
        },
      });
      return Ok(this.mapPasswordResetToken(created));
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the password reset token."));
    }
  }

  async findPasswordResetTokenByHash(
    tokenHash: string,
  ): Promise<Result<IPasswordResetTokenRecord | null, AuthError>> {
    try {
      const token = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
      return Ok(token ? this.mapPasswordResetToken(token) : null);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the password reset token."));
    }
  }

  async markPasswordResetTokenUsed(
    tokenId: string,
    usedAt: string,
  ): Promise<Result<IPasswordResetTokenRecord, AuthError>> {
    try {
      const updated = await this.prisma.passwordResetToken.update({
        where: { id: tokenId },
        data: { usedAt: new Date(usedAt) },
      });
      return Ok(this.mapPasswordResetToken(updated));
    } catch {
      return Err(UnexpectedDependencyError("Unable to update the password reset token."));
    }
  }

  async markUnusedPasswordResetTokensUsedForUser(
    userId: string,
    usedAt: string,
  ): Promise<Result<void, AuthError>> {
    try {
      await this.prisma.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date(usedAt) },
      });
      return Ok(undefined);
    } catch {
      return Err(UnexpectedDependencyError("Unable to update the password reset tokens."));
    }
  }

  async upsertMailingListSubscription(
    subscription: UpsertMailingListSubscriptionInput,
  ): Promise<Result<IMailingListSubscriptionRecord, AuthError>> {
    try {
      const saved = await this.prisma.mailingListSubscription.upsert({
        where: { email: subscription.email },
        create: {
          id: subscription.id,
          email: subscription.email,
          userId: subscription.userId,
          status: subscription.status,
          consentSource: subscription.consentSource,
          consentTextVersion: subscription.consentTextVersion,
          consentedAt: this.iso(subscription.consentedAt),
          unsubscribedAt: this.iso(subscription.unsubscribedAt),
          createdAt: new Date(subscription.createdAt),
          updatedAt: new Date(subscription.updatedAt),
        },
        update: {
          userId: subscription.userId,
          status: subscription.status,
          consentSource: subscription.consentSource,
          consentTextVersion: subscription.consentTextVersion,
          consentedAt: this.iso(subscription.consentedAt),
          unsubscribedAt: this.iso(subscription.unsubscribedAt),
          updatedAt: new Date(subscription.updatedAt),
        },
      });
      return Ok(this.mapMailingListSubscription(saved));
    } catch {
      return Err(UnexpectedDependencyError("Unable to save the mailing list subscription."));
    }
  }

  async findMailingListSubscriptionByEmail(
    email: string,
  ): Promise<Result<IMailingListSubscriptionRecord | null, AuthError>> {
    try {
      const subscription = await this.prisma.mailingListSubscription.findUnique({ where: { email } });
      return Ok(subscription ? this.mapMailingListSubscription(subscription) : null);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the mailing list subscription."));
    }
  }

  async findMailingListSubscriptionById(
    id: string,
  ): Promise<Result<IMailingListSubscriptionRecord | null, AuthError>> {
    try {
      const subscription = await this.prisma.mailingListSubscription.findUnique({ where: { id } });
      return Ok(subscription ? this.mapMailingListSubscription(subscription) : null);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the mailing list subscription."));
    }
  }

  async findMailingListSubscriptionByUserId(
    userId: string,
  ): Promise<Result<IMailingListSubscriptionRecord | null, AuthError>> {
    try {
      const subscription = await this.prisma.mailingListSubscription.findUnique({ where: { userId } });
      return Ok(subscription ? this.mapMailingListSubscription(subscription) : null);
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the mailing list subscription."));
    }
  }

  async listMailingListSubscriptionsByStatus(
    status: IMailingListSubscriptionRecord["status"],
  ): Promise<Result<IMailingListSubscriptionRecord[], AuthError>> {
    try {
      const subscriptions = await this.prisma.mailingListSubscription.findMany({
        where: { status },
      });
      return Ok(subscriptions.map((subscription) => this.mapMailingListSubscription(subscription)));
    } catch {
      return Err(UnexpectedDependencyError("Unable to read the mailing list subscriptions."));
    }
  }

  async bookmarkArticle(userId: string, articleId: string): Promise<Result<void, AuthError>> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      await this.prisma.bookmark.upsert({
        where: { userId_articleId: { userId, articleId } },
        create: { id: randomUUID(), userId, type: "article", articleId },
        update: {},
      });
      return Ok(undefined);
    } catch {
      return Err(UnexpectedDependencyError("Unable to bookmark the article."));
    }
  }

  async bookmarkForumPost(userId: string, forumPostId: string): Promise<Result<void, AuthError>> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      await this.prisma.bookmark.upsert({
        where: { userId_forumPostId: { userId, forumPostId } },
        create: { id: randomUUID(), userId, type: "forumPost", forumPostId },
        update: {},
      });
      return Ok(undefined);
    } catch {
      return Err(UnexpectedDependencyError("Unable to bookmark the forum post."));
    }
  }

  async removeBookmark(userId: string, bookmark: Bookmark): Promise<Result<void, AuthError>> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      await this.prisma.bookmark.deleteMany({
        where: bookmark.type === "article"
          ? { userId, type: "article", articleId: bookmark.articleId }
          : { userId, type: "forumPost", forumPostId: bookmark.forumPostId },
      });
      return Ok(undefined);
    } catch {
      return Err(UnexpectedDependencyError("Unable to remove the bookmark."));
    }
  }

  async getBookmarks(userId: string): Promise<Result<Bookmark[], AuthError>> {
    try {
      const user = await this.findUserRecord({ id: userId });
      if (!user) {
        return Err(UnexpectedDependencyError("User not found."));
      }
      return Ok(user.preferences.bookmarks);
    } catch {
      return Err(UnexpectedDependencyError("Unable to retrieve bookmarks."));
    }
  }
}

export function CreatePrismaUserRepository(prisma?: OnDraftPrismaClient): IUserRepository {
  return new PrismaUserRepository(prisma);
}
