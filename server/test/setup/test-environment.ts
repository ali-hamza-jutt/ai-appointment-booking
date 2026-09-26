export const TEST_ENVIRONMENT = {
  NODE_ENV: "test",
  LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "silent",
  JWT_SECRET: "test-secret-that-is-longer-than-32-characters",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    "postgresql://bookwise:bookwise@localhost:5432/bookwise_test?schema=public",
} as const;
