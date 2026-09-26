export const TEST_ENVIRONMENT = {
  NODE_ENV: "test",
  LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "silent",
  JWT_SECRET: "test-secret-that-is-longer-than-32-characters",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    "postgresql://bookwise:bookwise@localhost:5432/bookwise_test?schema=public",
  // A separate logical database keeps test keys away from local development.
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15",
  // Tests read their own writes immediately; cache behaviour is tested directly.
  AVAILABILITY_CACHE_TTL_SECONDS: "0",
} as const;
