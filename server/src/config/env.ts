import "dotenv/config";

import { z } from "zod";

import {
  AI_CONSTANTS,
  AUTH_CONSTANTS,
} from "../constants/app.constants.js";

const optionalNonEmptyString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must contain at least 32 characters"),
  JWT_ISSUER: z.string().trim().min(1).default("bookwise-server"),
  JWT_AUDIENCE: z.string().trim().min(1).default("bookwise-web"),
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(86_400)
    .default(AUTH_CONSTANTS.DEFAULT_ACCESS_TOKEN_TTL_SECONDS),
  MISTRAL_API_KEY: optionalNonEmptyString,
  MISTRAL_MODEL: z
    .string()
    .trim()
    .min(1)
    .default(AI_CONSTANTS.DEFAULT_MODEL),
  MISTRAL_API_URL: z
    .url()
    .default(AI_CONSTANTS.DEFAULT_API_URL),
  AI_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(AI_CONSTANTS.MIN_REQUEST_TIMEOUT_MS)
    .max(AI_CONSTANTS.MAX_REQUEST_TIMEOUT_MS)
    .default(AI_CONSTANTS.DEFAULT_REQUEST_TIMEOUT_MS),
  AI_MAX_HISTORY_MESSAGES: z.coerce
    .number()
    .int()
    .min(1)
    .max(AI_CONSTANTS.MAX_HISTORY_MESSAGES)
    .default(AI_CONSTANTS.DEFAULT_MAX_HISTORY_MESSAGES),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const details = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsedEnvironment.data;
