import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { MistralProvider } from "../src/integrations/ai/providers/mistral.provider.js";
import { bookingService } from "../src/modules/bookings/booking.service.js";
import { knowledgeService } from "../src/modules/knowledge/knowledge.service.js";
import { ChatOrchestrationService } from "../src/modules/chat/chat-orchestration.service.js";
import type { ChatMessagePart, ChatTurnResponse } from "../src/modules/chat/dto/chat.dto.js";
import { readSlotToken } from "../src/utils/slot-token.js";
import { authHeader, createTestUser, type TestUser } from "../test/helpers/auth.js";
import { createTestBusiness, type TestBusiness } from "../test/helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../test/helpers/database.js";
import {
  EVAL_CASES,
  EVAL_KNOWLEDGE,
  EVAL_SERVICES,
  EVAL_STAFF,
  FROZEN_NOW,
  type EvalCase,
  type EvalService,
} from "./cases.js";
import {
  loadRecordings,
  RecordedProvider,
  saveRecordings,
  type Recordings,
  type SymbolTable,
} from "./recorded-provider.js";

/**
 * EVAL_MODE=recorded (default) replays recorded model replies and runs with
 * the normal tests. EVAL_MODE=live calls Mistral; EVAL_MODE=record also saves
 * the replies to recordings.json.
 */
const MODE = (process.env.EVAL_MODE ?? "recorded") as "recorded" | "live" | "record";
const HERE = dirname(fileURLToPath(import.meta.url));
const RECORDINGS_PATH = join(HERE, "recordings.json");
const RESULTS_DIR = join(HERE, "results");

/** Recordings must be perfect; a live model is graded against targets. */
const THRESHOLDS =
  MODE === "recorded"
    ? { bookingSuccess: 1, maxWrongSlot: 0, outcomeAccuracy: 1 }
    : { bookingSuccess: 0.8, maxWrongSlot: 0.05, outcomeAccuracy: 0.8 };

interface CaseResult {
  id: string;
  category: string;
  expected: string;
  passed: boolean;
  /** A hold was placed on a time, service or provider the customer didn't ask for. */
  wrongSlot: boolean;
  /** User turns until the slot was held, for booking cases. */
  turnsToBook: number | null;
  detail: string;
  toolCalls: number;
  error?: string;
}

function partsOf(turn: ChatTurnResponse | undefined): ChatMessagePart[] {
  return turn?.assistantMessage.structuredData?.parts ?? [];
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

async function setUpBusiness() {
  const owner = await createTestUser();
  const business = await createTestBusiness(owner, { name: "Eval Studio", timeZone: "UTC", currency: "USD" });

  await request(app)
    .patch(`/api/businesses/${business.id}/settings`)
    .set(...authHeader(owner))
    .send({ slotStepMinutes: 30, minimumNoticeMinutes: 60 })
    .expect(200);

  const services = new Map<string, string>();

  for (const service of EVAL_SERVICES) {
    const created = await request(app)
      .post(`/api/businesses/${business.id}/services`)
      .set(...authHeader(owner))
      .send(service)
      .expect(201);

    services.set(service.name, created.body.id);
  }

  const staff = new Map<string, string>();

  for (const member of EVAL_STAFF) {
    const created = await request(app)
      .post(`/api/businesses/${business.id}/staff`)
      .set(...authHeader(owner))
      .send({ displayName: member.name, services: member.services.map((name) => ({ serviceId: services.get(name) })) })
      .expect(201);

    staff.set(member.name, created.body.id);
    await request(app)
      .put(`/api/businesses/${business.id}/staff/${created.body.id}/working-hours`)
      .set(...authHeader(owner))
      .send({ items: member.weekdays.map((weekday) => ({ weekday, startTime: member.start, endTime: member.end })) })
      .expect(200);
  }

  for (const source of EVAL_KNOWLEDGE) {
    const created = await request(app)
      .post(`/api/businesses/${business.id}/knowledge-sources`)
      .set(...authHeader(owner))
      .send(source)
      .expect(201);
    const { contentHash } = await prisma.knowledgeSource.findFirstOrThrow({
      where: { id: created.body.id, businessId: business.id },
    });

    // Live runs embed with Mistral; recorded runs search by keywords.
    await knowledgeService.indexSource(business.id, created.body.id, contentHash);
  }

  return { business, services, staff };
}

const DONT_KNOW = /don't know|do not know|not sure|no information|couldn't find|can't find|cannot find|don't have (?:any )?(?:information|details)/i;

/** Passage text the model was shown by search_knowledge in the final turn. */
function knowledgeShown(provider: RecordedProvider): string | null {
  const results = provider.toolResults.get("search_knowledge");

  return results ? results.join("\n") : null;
}

async function book(business: TestBusiness, userId: string, serviceId: string, startsAt: string): Promise<string> {
  const hold = await bookingService.holdForUser({
    businessId: business.id,
    serviceId,
    startsAt: new Date(startsAt),
    userId,
    chatSessionId: null,
    notes: null,
    source: "FORM",
  });

  await bookingService.confirmHold(hold, { type: "CUSTOMER", userId });

  return hold.id;
}

function grade(
  evalCase: EvalCase,
  turns: ChatTurnResponse[],
  symbols: SymbolTable,
  heldAtTurn: number | null,
  provider: RecordedProvider,
) {
  const last = turns.at(-1);
  const parts = partsOf(last);
  const hold = last?.session.draft.hold ?? null;
  const expected = evalCase.expect;
  const confirmButtons = parts.filter((part) => part.type === "confirm");
  const service = (name: EvalService) => symbols.services.get(name);

  switch (expected.outcome) {
    case "held": {
      const right =
        hold?.startsAt === expected.startsAt &&
        hold.serviceName === expected.service &&
        (!expected.staff || hold.staffName === expected.staff);

      return {
        passed: Boolean(right),
        wrongSlot: Boolean(hold && !right),
        detail: hold ? `${hold.serviceName} ${hold.startsAt} ${hold.staffName ?? ""}`.trim() : "no hold",
        turnsToBook: right ? heldAtTurn : null,
      };
    }
    case "offered": {
      const picker = parts.find((part) => part.type === "slot_picker");
      const inRange =
        picker?.type === "slot_picker" &&
        picker.serviceId === service(expected.service) &&
        picker.slots.length > 0 &&
        picker.slots.every((slot) => {
          const hour = new Date(slot.startsAt).getUTCHours();
          const window = { morning: [0, 12], afternoon: [12, 17], evening: [17, 24] }[expected.partOfDay ?? "morning"];

          return slot.startsAt.startsWith(expected.date) && (!expected.partOfDay || (hour >= window[0]! && hour < window[1]!));
        });

      return { passed: !hold && Boolean(inRange), wrongSlot: Boolean(hold), detail: picker ? "picker shown" : "no picker", turnsToBook: null };
    }
    case "alternatives":
      return {
        passed: !hold && parts.some((part) => part.type === "slot_picker"),
        wrongSlot: Boolean(hold),
        detail: hold ? `held ${hold.startsAt}` : parts.map((part) => part.type).join(",") || "text only",
        turnsToBook: null,
      };
    case "clarify":
      return {
        passed: !hold && confirmButtons.length === 0 && (last?.assistantMessage.content.includes("?") ?? false),
        wrongSlot: Boolean(hold),
        detail: last?.assistantMessage.content ?? "",
        turnsToBook: null,
      };
    case "listed":
      return {
        passed: parts.some((part) => part.type === "booking_list" && part.bookings.length > 0),
        wrongSlot: Boolean(hold),
        detail: parts.map((part) => part.type).join(","),
        turnsToBook: null,
      };
    case "cancel_proposed": {
      const target = symbols.bookings.get(expected.booking);
      const ok = confirmButtons.some(
        (part) => part.action.type === "cancel_booking" && part.action.bookingId === target,
      );

      return { passed: ok, wrongSlot: Boolean(hold), detail: confirmButtons.map((part) => part.action.type).join(","), turnsToBook: null };
    }
    case "reschedule_proposed": {
      const target = symbols.bookings.get(expected.booking);
      const ok = confirmButtons.some(
        (part) =>
          part.action.type === "reschedule_booking" &&
          part.action.bookingId === target &&
          readSlotToken(part.action.slotToken, symbols.businessId, symbols.now)?.startsAt.toISOString() === expected.to,
      );

      return { passed: ok, wrongSlot: Boolean(hold), detail: confirmButtons.map((part) => part.action.type).join(","), turnsToBook: null };
    }
    case "refused":
      return {
        passed: !hold && confirmButtons.length === 0 && !parts.some((part) => part.type === "slot_picker"),
        wrongSlot: Boolean(hold),
        detail: last?.assistantMessage.content ?? "",
        turnsToBook: null,
      };
    case "handoff":
      return {
        passed: Boolean(last?.session.handoff),
        wrongSlot: Boolean(hold),
        detail: last?.session.handoff?.reason ?? "no handoff",
        turnsToBook: null,
      };
    case "answered": {
      const reply = (last?.assistantMessage.content ?? "").toLowerCase();
      const shown = knowledgeShown(provider)?.toLowerCase() ?? "";
      // Every fact must be in the reply and in a passage the model was shown.
      const grounded = expected.mentions.every(
        (fact) => reply.includes(fact.toLowerCase()) && shown.includes(fact.toLowerCase()),
      );

      return {
        passed: !hold && confirmButtons.length === 0 && grounded,
        wrongSlot: Boolean(hold),
        detail: `${shown ? "searched" : "no search"}: ${last?.assistantMessage.content ?? ""}`,
        turnsToBook: null,
      };
    }
    case "unknown": {
      const reply = last?.assistantMessage.content ?? "";

      return {
        passed: !hold && knowledgeShown(provider) !== null && DONT_KNOW.test(reply),
        wrongSlot: Boolean(hold),
        detail: reply,
        turnsToBook: null,
      };
    }
  }
}

function summarize(results: CaseResult[]) {
  const bookingCases = results.filter((result) => result.expected.startsWith("held"));
  const booked = bookingCases.filter((result) => result.passed);
  const holdsPlaced = results.filter((result) => result.wrongSlot || (result.passed && result.turnsToBook !== null));
  const byCategory = Object.fromEntries(
    [...new Set(results.map((result) => result.category))].map((category) => {
      const inCategory = results.filter((result) => result.category === category);

      return [category, `${inCategory.filter((result) => result.passed).length}/${inCategory.length}`];
    }),
  );

  return {
    mode: MODE,
    cases: results.length,
    bookingSuccess: booked.length / Math.max(bookingCases.length, 1),
    wrongSlot: results.filter((result) => result.wrongSlot).length / Math.max(holdsPlaced.length, 1),
    turnsToBook: booked.reduce((sum, result) => sum + (result.turnsToBook ?? 0), 0) / Math.max(booked.length, 1),
    toolCallsPerCase: results.reduce((sum, result) => sum + result.toolCalls, 0) / results.length,
    outcomeAccuracy: results.filter((result) => result.passed).length / results.length,
    byCategory,
  };
}

describe(`booking agent evals (${MODE})`, () => {
  const results: CaseResult[] = [];
  const captured: Recordings = {};
  let recordings: Recordings = {};
  let business: TestBusiness;
  let services: Map<string, string>;
  let staff: Map<string, string>;

  beforeAll(async () => {
    // Only Date is frozen; timers and I/O run normally.
    vi.useFakeTimers({ toFake: ["Date"], now: FROZEN_NOW });
    await resetDatabase();
    recordings = MODE === "recorded" ? loadRecordings(RECORDINGS_PATH) : {};
    ({ business, services, staff } = await setUpBusiness());
  });

  afterAll(async () => {
    vi.useRealTimers();
    await disconnectTestDatabase();
  });

  async function runCase(evalCase: EvalCase): Promise<CaseResult> {
    const customer: TestUser = await createTestUser();
    const bookings = new Map<string, string>();

    for (const existing of evalCase.existingBookings ?? []) {
      bookings.set(existing.startsAt, await book(business, customer.id, services.get(existing.service)!, existing.startsAt));
    }

    for (const taken of evalCase.takenSlots ?? []) {
      await book(business, (await createTestUser()).id, services.get(taken.service)!, taken.startsAt);
    }

    const symbols: SymbolTable = { businessId: business.id, now: FROZEN_NOW, services, staff, bookings };
    const provider = new RecordedProvider(evalCase.id, recordings[evalCase.id], symbols, liveProvider());
    const orchestration = new ChatOrchestrationService(provider);
    const session = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(customer))
      .send({ businessSlug: business.slug })
      .expect(201);
    const turns: ChatTurnResponse[] = [];
    let heldAtTurn: number | null = null;
    let error: string | undefined;

    try {
      for (const [index, content] of evalCase.turns.entries()) {
        const turn = await orchestration.processMessage(customer.id, session.body.id, {
          clientMessageId: randomUUID(),
          content,
          timeZone: "UTC",
        });

        turns.push(turn);
        if (heldAtTurn === null && turn.session.draft.hold) heldAtTurn = index + 1;
      }
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    }

    if (provider.captured.length > 0) captured[evalCase.id] = provider.captured;

    const graded = grade(evalCase, turns, symbols, heldAtTurn, provider);
    const expected = evalCase.expect;

    return {
      id: evalCase.id,
      category: evalCase.category,
      expected:
        expected.outcome === "held" ? `held ${expected.service} ${expected.startsAt}${expected.staff ? ` ${expected.staff}` : ""}` : expected.outcome,
      ...graded,
      passed: graded.passed && !error,
      toolCalls: provider.calledTools.length,
      ...(error ? { error } : {}),
    };
  }

  for (const evalCase of EVAL_CASES) {
    it(evalCase.id, async () => {
      const result = await runCase(evalCase);

      results.push(result);
      // Each case starts from an empty schedule.
      await prisma.booking.updateMany({
        where: { businessId: business.id, status: { in: ["HELD", "CONFIRMED", "PENDING"] } },
        data: { status: "CANCELLED" },
      });

      if (MODE === "recorded") expect(result, `${result.expected}: ${result.detail}`).toMatchObject({ passed: true });
    });
  }

  it("meets the success thresholds", () => {
    const summary = summarize(results);

    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(join(RESULTS_DIR, `${MODE}-latest.json`), `${JSON.stringify({ summary, results }, null, 2)}\n`);
    if (MODE === "record") saveRecordings(RECORDINGS_PATH, captured);

    if (MODE !== "recorded" || results.some((result) => !result.passed)) {
      console.table(results.map(({ id, expected, passed, detail, error }) => ({ id, expected, passed, detail: detail.slice(0, 60), error })));
    }
    console.info(summary);

    expect(summary.bookingSuccess).toBeGreaterThanOrEqual(THRESHOLDS.bookingSuccess);
    expect(summary.wrongSlot).toBeLessThanOrEqual(THRESHOLDS.maxWrongSlot);
    expect(summary.outcomeAccuracy).toBeGreaterThanOrEqual(THRESHOLDS.outcomeAccuracy);
  });
});
