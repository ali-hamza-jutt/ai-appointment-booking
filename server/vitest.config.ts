import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup/environment.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: [
            "test/integration/**/*.test.ts",
            "test/contract/**/*.test.ts",
          ],
          globalSetup: ["./test/setup/database.ts"],
          fileParallelism: false,
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "evals",
          include: ["evals/**/*.eval.ts"],
          globalSetup: ["./test/setup/database.ts"],
          fileParallelism: false,
          hookTimeout: 60_000,
          testTimeout: 120_000,
        },
      },
    ],
  },
});
