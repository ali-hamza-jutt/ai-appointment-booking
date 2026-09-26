import { execSync } from "node:child_process";

import { TEST_ENVIRONMENT } from "./test-environment.js";

export default function setupTestDatabase(): void {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_ENVIRONMENT.DATABASE_URL },
    stdio: "inherit",
  });
}
