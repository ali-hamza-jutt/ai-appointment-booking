import "dotenv/config";

import { z } from "zod";

import {
  AI_CONSTANTS,
  AI_GUARDRAIL_CONSTANTS,
  AUTH_CONSTANTS,
  JOB_CONSTANTS,
  KNOWLEDGE_CONSTANTS,
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
  /** Public base URL of this API, used for OAuth redirect URIs. */
  API_PUBLIC_URL: z.url().default("http://localhost:4000"),
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
  MISTRAL_EMBED_MODEL: z.string().trim().min(1).default(KNOWLEDGE_CONSTANTS.DEFAULT_EMBED_MODEL),
  AI_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(AI_CONSTANTS.MIN_REQUEST_TIMEOUT_MS)
    .max(AI_CONSTANTS.MAX_REQUEST_TIMEOUT_MS)
    .default(AI_CONSTANTS.DEFAULT_REQUEST_TIMEOUT_MS),
  /** Domain for the refresh cookie when the web app and API use sibling subdomains. */
  COOKIE_DOMAIN: optionalNonEmptyString,
  /** SMTP connection URL; without it, emails are written to the log outside production. */
  SMTP_URL: optionalNonEmptyString,
  MAIL_FROM: z.string().trim().min(3).default("BookWise <no-reply@bookwise.local>"),
  GOOGLE_CLIENT_ID: optionalNonEmptyString,
  GOOGLE_CLIENT_SECRET: optionalNonEmptyString,
  /** Twilio credentials; without them SMS is logged outside production and unavailable in it. */
  TWILIO_ACCOUNT_SID: optionalNonEmptyString,
  TWILIO_AUTH_TOKEN: optionalNonEmptyString,
  /** Sender: a Twilio phone number in E.164 form, or a messaging service SID (MG…). */
  TWILIO_FROM: optionalNonEmptyString,
  /**
   * 32 random bytes, base64 encoded (openssl rand -base64 32). Encrypts
   * calendar OAuth tokens; calendar sync is off without it.
   */
  TOKEN_ENCRYPTION_KEY: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .trim()
      .refine((value) => Buffer.from(value, "base64").length === 32, "must be 32 bytes, base64 encoded")
      .optional(),
  ),
  /** Microsoft Entra app for Microsoft 365 calendar sync. */
  MICROSOFT_CLIENT_ID: optionalNonEmptyString,
  MICROSOFT_CLIENT_SECRET: optionalNonEmptyString,
  MICROSOFT_TENANT_ID: z.string().trim().min(1).default("common"),
  /** Stripe platform secret key (sk_…); online payments are off without it and the webhook secret. */
  STRIPE_SECRET_KEY: optionalNonEmptyString,
  /**
   * Webhook signing secrets (whsec_…), comma-separated: one for the account
   * endpoint (checkout and refunds) and one for the Connect endpoint (account updates).
   */
  STRIPE_WEBHOOK_SECRET: optionalNonEmptyString,
  /** Web Push keys (npx web-push generate-vapid-keys); with both set, browser notifications are on. */
  VAPID_PUBLIC_KEY: optionalNonEmptyString,
  VAPID_PRIVATE_KEY: optionalNonEmptyString,
  /** Who push services can contact about this sender: a mailto: or https: URL. */
  VAPID_SUBJECT: z.string().default("mailto:support@bookwise.app"),
  /** Stripe Billing prices (price_…) for the Starter and Pro plans. With both set, plan limits apply. */
  STRIPE_PRICE_STARTER: optionalNonEmptyString,
  STRIPE_PRICE_PRO: optionalNonEmptyString,
  /** BookWise's cut of each payment, in percent. */
  STRIPE_PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(50).default(0),
  /** Exposes Prometheus metrics for the API on this port (e.g. 9464). */
  METRICS_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  /** Exposes Prometheus metrics for the worker on this port (e.g. 9465). */
  WORKER_METRICS_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  /** OTLP/HTTP collector base URL; traces are exported when set. */
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalNonEmptyString,
  /** Share of new traces to keep, from 0 to 1. */
  OTEL_TRACES_SAMPLE_RATIO: z.coerce.number().min(0).max(1).default(1),
  SENTRY_DSN: optionalNonEmptyString,
  /** Release name reported with traces and errors, e.g. a git SHA. */
  APP_RELEASE: optionalNonEmptyString,
  /** Enables the job queue, shared rate limits and the availability cache. */
  REDIS_URL: optionalNonEmptyString,
  OUTBOX_RELAY_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(JOB_CONSTANTS.DEFAULT_OUTBOX_RELAY_INTERVAL_MS),
  AVAILABILITY_CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(3_600)
    .default(JOB_CONSTANTS.DEFAULT_AVAILABILITY_CACHE_TTL_SECONDS),
  /** Tokens the assistant may use per business per (UTC) day; 0 turns the cap off. */
  LLM_DAILY_TOKEN_BUDGET: z.coerce.number().int().min(0).default(2_000_000),
  /** Assistant turns one customer can start per minute, on any channel. */
  AI_MAX_TURNS_PER_MINUTE: z.coerce.number().int().min(1).default(AI_GUARDRAIL_CONSTANTS.DEFAULT_MAX_TURNS_PER_MINUTE),
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
