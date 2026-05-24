import { hashPassword } from "../../src/auth/PasswordHasher";
import { disconnectPrismaClient, getPrismaClient } from "../../src/prisma/client";

const TEST_DATABASE_URL = "file:./prisma/test.db";
const ADMIN_CREATED_AT = new Date("2026-05-19T00:00:00.000Z");

const ADMIN_USERS = [
  {
    id: "user-support",
    email: "support@ondraftfootball.com",
    displayName: "OnDraft Support",
  },
  {
    id: "user-ryan",
    email: "ryan@ondraftfootball.com",
    displayName: "Ryan McWalter",
  },
  {
    id: "user-aleks",
    email: "aleks@ondraftfootball.com",
    displayName: "Aleks OnDraft",
  },
];

export function usePrismaTestDatabase(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REPO_MODE = "prisma";
}

export async function clearPrismaTestDatabase(): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.$transaction([
    prisma.browserSession.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.mailingListSubscription.deleteMany(),
    prisma.userBan.deleteMany(),
    prisma.bookmark.deleteMany(),
    prisma.commentLike.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.articleLike.deleteMany(),
    prisma.articleTag.deleteMany(),
    prisma.videoTag.deleteMany(),
    prisma.forumPostLike.deleteMany(),
    prisma.forumPostComment.deleteMany(),
    prisma.forumPost.deleteMany(),
    prisma.bigBoardEntry.deleteMany(),
    prisma.bigBoard.deleteMany(),
    prisma.video.deleteMany(),
    prisma.article.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export async function resetPrismaTestDatabase(): Promise<void> {
  const prisma = getPrismaClient();

  await clearPrismaTestDatabase();

  const passwordHash = await hashPassword("password123");
  await prisma.user.createMany({
    data: ADMIN_USERS.map((admin) => ({
      ...admin,
      emailVerifiedAt: ADMIN_CREATED_AT,
      passwordHash,
      role: "admin",
      theme: "light",
      fontSize: "small",
      createdAt: ADMIN_CREATED_AT,
    })),
  });
}

export async function disconnectPrismaTestDatabase(): Promise<void> {
  await disconnectPrismaClient();
}
