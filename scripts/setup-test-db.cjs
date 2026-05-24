const { spawnSync } = require("node:child_process");
require("dotenv/config");

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required to prepare the Prisma test database.");
}

const result = spawnSync(
  "npx",
  ["prisma", "db", "push", "--schema", "prisma/schema.prisma"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
