import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { CHAT_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { ChatOrchestrationService } from "../../src/modules/chat/chat-orchestration.service.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { createBookableSetup, type BookableSetup } from "../helpers/booking.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { resetRedis } from "../helpers/redis.js";
import { ScriptedProvider } from "../helpers/scripted-provider.js";

describe("assistant guardrails", () => {
  const original = { turns: env.AI_MAX_TURNS_PER_MINUTE, budget: env.LLM_DAILY_TOKEN_BUDGET };
  let setup: BookableSetup;
  let customer: TestUser;
  let provider: ScriptedProvider;
  let orchestration: ChatOrchestrationService;
  let sessionId: string;

  const send = (content: string) =>
    orchestration.processMessage(customer.id, sessionId, { clientMessageId: randomUUID(), content, timeZone: "UTC" });

  beforeEach(async () => {
    await resetDatabase();
    await resetRedis();
    setup = await createBookableSetup({ daysAhead: 2 });
    customer = await createTestUser();
    provider = new ScriptedProvider();
    orchestration = new ChatOrchestrationService(provider);
    sessionId = (
      await request(app)
        .post("/api/chat/sessions")
        .set(...authHeader(customer))
        .send({ businessSlug: setup.business.slug })
        .expect(201)
    ).body.id;
  });

  afterEach(() => {
    env.AI_MAX_TURNS_PER_MINUTE = original.turns;
    env.LLM_DAILY_TOKEN_BUDGET = original.budget;
  });

  afterAll(disconnectTestDatabase);

  it("slows a customer down after too many turns a minute, without calling the model", async () => {
    env.AI_MAX_TURNS_PER_MINUTE = 2;
    provider.script({ text: "Friday afternoon has a few times." }, { text: "Saturday is quieter." });

    await send("Anything on Friday afternoon?");
    await send("And Saturday?");

    const third = await send("What about Sunday?");

    expect(provider.requests).toHaveLength(2);
    expect(third.assistantMessage.content).toBe(CHAT_CONSTANTS.ASSISTANT_MESSAGES.SLOW_DOWN);
    // Booking still works: the reply offers the services to tap.
    expect(third.assistantMessage.structuredData?.parts?.map((part) => part.type)).toContain("service_cards");
  });

  it("stops using the model once a business spends its daily token budget", async () => {
    env.LLM_DAILY_TOKEN_BUDGET = 1_000;
    await prisma.llmUsage.create({
      data: {
        businessId: setup.business.id,
        date: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`),
        model: "mistral-small-latest",
        requests: 3,
        inputTokens: 800n,
        outputTokens: 200n,
      },
    });

    const turn = await send("Anything on Friday afternoon?");

    expect(provider.requests).toHaveLength(0);
    expect(turn.assistantMessage.content).toBe(CHAT_CONSTANTS.ASSISTANT_MESSAGES.ASSISTANT_BUSY);

    // With the cap off, the assistant answers again.
    env.LLM_DAILY_TOKEN_BUDGET = 0;
    provider.script({ text: "Friday afternoon has a few times." });

    expect((await send("Anything on Friday afternoon?")).assistantMessage.content).toBe("Friday afternoon has a few times.");
  });
});
