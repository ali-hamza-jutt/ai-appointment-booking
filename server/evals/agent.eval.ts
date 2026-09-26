import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { AiService } from "../src/integrations/ai/ai.service.js";
import type {
  AppointmentExtractionResult,
  ExtractAppointmentRequest,
} from "../src/integrations/ai/dto/ai.dto.js";
import { MistralProvider } from "../src/integrations/ai/providers/mistral.provider.js";
import { bookingService } from "../src/modules/bookings/booking.service.js";
import { catalogService } from "../src/modules/catalog/catalog.service.js";
import { ChatOrchestrationService } from "../src/modules/chat/chat-orchestration.service.js";
import { chatService } from "../src/modules/chat/chat.service.js";
import { authHeader, createTestUser, type TestUser } from "../test/helpers/auth.js";
import { createTestBusiness, createTestService, type TestBusiness } from "../test/helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../test/helpers/database.js";
import { EVAL_CASES, EVAL_SERVICES, FROZEN_NOW, type EvalCase } from "./cases.js";
import {
  loadRecordings,
  RecordedProvider,
  saveRecordings,
  type Recordings,
} from "./recorded-provider.js";

/**
 * EVAL_MODE=recorded (default) replays recorded model replies and runs in CI.
 * EVAL_MODE=live calls Mistral; EVAL_MODE=record also saves the replies.
 */
const MODE = (process.env.EVAL_MODE ?? "recorded") as "recorded" | "live" | "record";
const HERE = dirname(fileURLToPath(import.meta.url));
const RECORDINGS_PATH = join(HERE, "recordings.json");
const RESULTS_DIR = join(HERE, "results");

/** Live models are graded against targets; recordings must be perfect. */
const THRESHOLDS =
  MODE === "recorded"
    ? { bookingSuccess: 1, maxWrongSlot: 0, outcomeAccuracy: 1 }
    : { bookingSuccess: 0.8, maxWrongSlot: 0.05, outcomeAccuracy: 0.85 };

type Outcome = "held" | "clarify" | "refused" | "alternatives" | "other";

interface CaseResult {
  id: string;
  expected: string;
  actual: Outcome;
  heldAt?: string;
  heldService?: string;
  passed: boolean;
  wrongSlot: boolean;
  error?: string;
}

/** Keeps the last extraction so outcomes can be told apart precisely. */
class ObservedAi {
  public last: AppointmentExtractionResult | null = null;

  public constructor(private readonly inner: AiService) {}

  public async extractAppointmentDetails(input: ExtractAppointmentRequest) {
    this.last = await this.inner.extractAppointmentDetails(input);

    return this.last;
  }
}

function liveProvider(): MistralProvider | null {
  if (MODE === "recorded") return null;
  if (!env.MISTRAL_API_KEY) throw new Error(`EVAL_MODE=${MODE} needs MISTRAL_API_KEY`);

  return new MistralProvider({
    apiKey: env.MISTRAL_API_KEY,
    model: env.MISTRAL_MODEL,
    apiUrl: env.MISTRAL_API_URL,
    timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  });
}

async function setUpBusiness(): Promise<{ owner: TestUser; business: TestBusiness }> {
  const owner = await createTestUser();
  const business = await createTestBusiness(owner, { timeZone: "UTC", currency: "USD" });

  await request(app)
    .patch(`/api/businesses/${business.id}/settings`)
    .set(...authHeader(owner))
    .send({ slotStepMinutes: 30, minimumNoticeMinutes: 60 })
    .expect(200);

  const serviceIds = [];

  for (const service of EVAL_SERVICES) {
    serviceIds.push(await createTestService(owner, business, { ...service, priceMinor: 3_000 }));
  }

  const staff = await request(app)
    .post(`/api/businesses/${business.id}/staff`)
    .set(...authHeader(owner))
    .send({ displayName: "Sana", services: serviceIds.map((serviceId) => ({ serviceId })) })
    .expect(201);

  // Monday to Saturday; closed on Sunday.
  await request(app)
    .put(`/api/businesses/${business.id}/staff/${staff.body.id}/working-hours`)
    .set(...authHeader(owner))
    .send({ items: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })) })
    .expect(200);

  return { owner, business };
}

async function runCase(
  evalCase: EvalCase,
  business: TestBusiness,
  recordings: Recordings,
  captured: Recordings,
): Promise<CaseResult> {
  const provider = new RecordedProvider(evalCase.id, recordings[evalCase.id], liveProvider());
  const ai = new ObservedAi(new AiService(provider, env.AI_MAX_HISTORY_MESSAGES));
  const orchestration = new ChatOrchestrationService(ai, chatService, bookingService, catalogService);
  const customer = await createTestUser();
  const session = await request(app)
    .post("/api/chat/sessions")
    .set(...authHeader(customer))
    .send({ businessSlug: business.slug })
    .expect(201);
  const expected = evalCase.expect;
  const result: CaseResult = {
    id: evalCase.id,
    expected: expected.outcome === "held" ? `held ${expected.service} ${expected.startsAt}` : expected.outcome,
    actual: "other",
    passed: false,
    wrongSlot: false,
  };

  try {
    let turn;

    for (const content of evalCase.turns) {
      turn = await orchestration.processMessage(customer.id, session.body.id, {
        clientMessageId: randomUUID(),
        content,
        timeZone: "UTC",
      });
    }

    const data = turn?.assistantMessage.structuredData;
    const holdId = turn?.session.bookingContext?.holdBookingId;

    if (holdId) {
      const hold = await prisma.booking.findFirstOrThrow({
        where: { id: holdId, businessId: business.id },
        select: { scheduledAt: true, serviceName: true },
      });

      result.actual = "held";
      result.heldAt = hold.scheduledAt.toISOString();
      result.heldService = hold.serviceName;
    } else if (data?.suggestedTimes?.length) {
      result.actual = "alternatives";
    } else if (ai.last?.intent === "OUT_OF_SCOPE") {
      result.actual = "refused";
    } else if (ai.last?.intent === "BOOK_APPOINTMENT" && data?.missingFields?.length) {
      result.actual = "clarify";
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  if (provider.captured.length > 0) captured[evalCase.id] = provider.captured;

  result.wrongSlot =
    result.actual === "held" &&
    (expected.outcome !== "held" || result.heldAt !== expected.startsAt || result.heldService !== expected.service);
  result.passed =
    expected.outcome === "held" ? result.actual === "held" && !result.wrongSlot : result.actual === expected.outcome;

  return result;
}

function summarize(results: CaseResult[]) {
  const bookingCases = results.filter((result) => result.expected.startsWith("held"));
  const holds = results.filter((result) => result.actual === "held");

  return {
    mode: MODE,
    cases: results.length,
    bookingSuccess: bookingCases.filter((result) => result.passed).length / Math.max(bookingCases.length, 1),
    wrongSlot: holds.filter((result) => result.wrongSlot).length / Math.max(holds.length, 1),
    outcomeAccuracy: results.filter((result) => result.passed).length / results.length,
  };
}

describe(`booking assistant evals (${MODE})`, () => {
  const results: CaseResult[] = [];
  const captured: Recordings = {};
  let recordings: Recordings = {};
  let business: TestBusiness;

  beforeAll(async () => {
    // Only Date is frozen; timers and I/O run normally.
    vi.useFakeTimers({ toFake: ["Date"], now: FROZEN_NOW });
    await resetDatabase();
    recordings = MODE === "recorded" ? loadRecordings(RECORDINGS_PATH) : {};
    ({ business } = await setUpBusiness());
  });

  afterAll(async () => {
    vi.useRealTimers();
    await disconnectTestDatabase();
  });

  for (const evalCase of EVAL_CASES) {
    it(evalCase.id, async () => {
      const result = await runCase(evalCase, business, recordings, captured);

      results.push(result);
      // Each case starts from an empty schedule.
      await prisma.booking.updateMany({
        where: { businessId: business.id, status: { in: ["HELD", "CONFIRMED", "PENDING"] } },
        data: { status: "CANCELLED" },
      });

      if (MODE === "recorded") expect(result, evalCase.description).toMatchObject({ passed: true });
    });
  }

  it("meets the success thresholds", () => {
    const summary = summarize(results);

    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(join(RESULTS_DIR, `${MODE}-latest.json`), `${JSON.stringify({ summary, results }, null, 2)}\n`);
    if (MODE === "record") saveRecordings(RECORDINGS_PATH, captured);

    console.table(results.map(({ id, expected, actual, heldAt, passed, error }) => ({ id, expected, actual, heldAt, passed, error })));
    console.info(summary);

    expect(summary.bookingSuccess).toBeGreaterThanOrEqual(THRESHOLDS.bookingSuccess);
    expect(summary.wrongSlot).toBeLessThanOrEqual(THRESHOLDS.maxWrongSlot);
    expect(summary.outcomeAccuracy).toBeGreaterThanOrEqual(THRESHOLDS.outcomeAccuracy);
  });
});
