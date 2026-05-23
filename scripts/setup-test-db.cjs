const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

fs.closeSync(fs.openSync(path.join(process.cwd(), "prisma", "test.db"), "a"));

const result = spawnSync(
  "npx",
  ["prisma", "db", "push", "--schema", "prisma/schema.prisma"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: "file:./prisma/test.db",
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
