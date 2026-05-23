import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

let prismaClient: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for Prisma repository mode.");
  }

  prismaClient ??= new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
  });
  return prismaClient;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = null;
}

export type OnDraftPrismaClient = PrismaClient;
