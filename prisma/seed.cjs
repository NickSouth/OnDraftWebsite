const { randomBytes, scryptSync } = require("node:crypto");
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }),
});

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

const adminPassword = process.env.ONDRAFT_ADMIN_PASSWORD || "password123";
const adminPasswordHash = hashPassword(adminPassword);
const verifiedAt = new Date("2026-05-19T00:00:00.000Z");

const admins = [
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

async function main() {
  for (const admin of admins) {
    await prisma.user.upsert({
      where: { email: admin.email },
      create: {
        ...admin,
        emailVerifiedAt: verifiedAt,
        passwordHash: adminPasswordHash,
        role: "admin",
        theme: "light",
        fontSize: "small",
        createdAt: verifiedAt,
      },
      update: {
        id: admin.id,
        displayName: admin.displayName,
        emailVerifiedAt: verifiedAt,
        role: "admin",
      },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
