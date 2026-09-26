import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { ChatOrchestrationService } from "../../src/modules/chat/chat-orchestration.service.js";
import { createChatStreamRouter } from "../../src/modules/chat/controllers/chat-stream.routes.js";
import { errorHandler } from "../../src/middleware/error-handler.js";
import { requestLogger } from "../../src/middleware/request-logger.js";
import { readServerSentEvents, type ServerSentEvent } from "../../src/utils/sse.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { createBookableSetup, type BookableSetup } from "../helpers/booking.js";
import { addTestMember } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { lastToolResult, ScriptedProvider } from "../helpers/scripted-provider.js";

interface StreamedEvent {
  event: string;
  data: Record<string, unknown>;
}

function parseEventStream(text: string): StreamedEvent[] {
  return text
    .split("\n\n")
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];

      return event && data ? { event, data: JSON.parse(data) as Record<string, unknown> } : null;
    })
    .filter((event): event is StreamedEvent => event !== null);
}

/** Supertest doesn't buffer text/event-stream on its own. */
const collectText = (response: request.Response, callback: (error: Error | null, body: unknown) => void) => {
  const stream = response as unknown as NodeJS.ReadableStream;
  let body = "";

  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => (body += chunk));
  stream.on("end", () => callback(null, body));
};

describe("chat streaming", () => {
  const provider = new ScriptedProvider();
  const streamApp = express()
    .use(requestLogger)
    .use(express.json())
    .use(createChatStreamRouter(new ChatOrchestrationService(provider)))
    .use(errorHandler);
  let setup: BookableSetup;
  let customer: TestUser;
  let sessionId: string;

  function postStream(body: Record<string, unknown>, user: TestUser | null = customer) {
    const call = request(streamApp)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set("Accept", "text/event-stream")
      .buffer(true)
      .parse(collectText);

    return user ? call.set(...authHeader(user)).send(body) : call.send(body);
  }

  function scriptBooking() {
    provider.script(
      { tools: [{ name: "search_services", args: { query: "haircut" } }] },
      (req) => ({
        tools: [
          {
            name: "get_availability",
            args: {
              serviceId: lastToolResult<{ services: Array<{ serviceId: string }> }>(req.messages, "search_services").services[0]
                ?.serviceId,
              date: setup.day,
              time: "10:00",
            },
          },
        ],
      }),
      (req) => ({
        tools: [
          {
            name: "propose_booking",
            args: { slotToken: lastToolResult<{ requested: { slotToken: string } }>(req.messages, "get_availability").requested.slotToken },
          },
        ],
      }),
      { text: "It's held for you. Press Confirm booking." },
    );
  }

  beforeEach(async () => {
    await resetDatabase();
    provider.requests.length = 0;
    provider.streamedCalls = 0;
    setup = await createBookableSetup();
    customer = await createTestUser();

    const session = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(customer))
      .send({ businessSlug: setup.business.slug })
      .expect(201);

    sessionId = session.body.id;
  });

  afterAll(disconnectTestDatabase);

  it("streams status, cards and tokens, then the persisted turn", async () => {
    scriptBooking();

    const clientMessageId = randomUUID();
    const response = await postStream({ clientMessageId, content: "Haircut next Tuesday at 10", timeZone: "UTC" }).expect(200);

    expect(response.headers["content-type"]).toContain("text/event-stream");

    const events = parseEventStream(response.body as string);
    const statuses = events.filter((item) => item.event === "status").map((item) => item.data.text);
    const tokens = events.filter((item) => item.event === "token").map((item) => item.data.text).join("");
    const done = events.at(-1);

    expect(statuses[0]).toBe("Thinking…");
    expect(statuses).toContain("Looking up services…");
    expect(statuses.some((text) => typeof text === "string" && /^Checking Tuesday/.test(text))).toBe(true);
    expect(events.some((item) => item.event === "part" && (item.data.part as { type: string }).type === "confirm")).toBe(true);
    expect(tokens).toBe("It's held for you. Press Confirm booking.");
    expect(done?.event).toBe("done");
    expect(done?.data).toMatchObject({
      assistantMessage: { content: "It's held for you. Press Confirm booking." },
      session: { draft: { hold: { startsAt: setup.at("10:00") } } },
    });
    expect(provider.streamedCalls).toBe(4);

    // Sending the same message again replays the saved reply; nothing new is written.
    const replay = parseEventStream(
      (await postStream({ clientMessageId, content: "Haircut next Tuesday at 10", timeZone: "UTC" }).expect(200)).body as string,
    );

    expect(replay.map((item) => item.event)).toEqual(["done"]);
    expect(await prisma.chatMessage.count({ where: { sessionId, role: "ASSISTANT" } })).toBe(1);
  });

  it("answers with JSON errors before the stream opens", async () => {
    await postStream({ clientMessageId: randomUUID(), content: "hi", timeZone: "UTC" }, null).expect(401);

    const invalid = await postStream({ clientMessageId: "nope", content: "", timeZone: "UTC" }).expect(422);

    expect(JSON.parse(invalid.body as string).error.fieldErrors).toHaveProperty("clientMessageId");
  });

  it("ends with an error event when the turn fails after the stream opens", async () => {
    await prisma.chatSession.updateMany({ where: { id: sessionId, userId: customer.id }, data: { status: "CLOSED" } });

    const events = parseEventStream(
      (await postStream({ clientMessageId: randomUUID(), content: "Haircut please", timeZone: "UTC" }).expect(200)).body as string,
    );

    expect(events.at(-1)).toMatchObject({ event: "error", data: { statusCode: 409 } });
  });

  it("leaves the JSON endpoint unchanged without the event-stream Accept header", async () => {
    const response = await request(app)
      .post(`/api/chat/sessions/${sessionId}/messages`)
      .set(...authHeader(customer))
      .send({ clientMessageId: randomUUID(), content: "hello", timeZone: "UTC" })
      .expect(201);

    expect(response.body.assistantMessage.role).toBe("ASSISTANT");
  });

  describe("change events", () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
      server = app.listen(0);
      await new Promise((resolve) => server.once("listening", resolve));
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });

    /** Opens an event stream and waits until the server says it's subscribed. */
    async function listen(path: string, user: TestUser) {
      const controller = new AbortController();
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
        signal: controller.signal,
      });

      if (!response.body || response.status !== 200) return { status: response.status, close: () => controller.abort() };

      const events = readServerSentEvents(response.body);
      const next = async (): Promise<ServerSentEvent> => {
        const timer = setTimeout(() => controller.abort(), 5_000);
        const result = await events.next();

        clearTimeout(timer);
        if (result.done) throw new Error("Stream ended");

        return result.value;
      };

      expect((await next()).event).toBe("ready");

      return { status: 200, next, close: () => controller.abort() };
    }

    it("tells the customer's other tabs about new messages", async () => {
      const stream = await listen(`/api/chat/sessions/${sessionId}/events`, customer);

      await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set(...authHeader(customer))
        .send({ clientMessageId: randomUUID(), content: "hello", timeZone: "UTC" })
        .expect(201);

      const first = JSON.parse((await stream.next!()).data);
      const second = JSON.parse((await stream.next!()).data);

      expect([first.role, second.role]).toEqual(["USER", "ASSISTANT"]);
      expect(first).toMatchObject({ type: "message", sessionId, businessId: setup.business.id });
      stream.close();
    });

    it("streams business chat changes to staff only", async () => {
      const outsider = await createTestUser();

      expect((await listen(`/api/chat/sessions/${sessionId}/events`, outsider)).status).toBe(404);
      expect((await listen(`/api/businesses/${setup.business.id}/chat-events`, outsider)).status).toBe(404);

      const staff = await createTestUser();

      await addTestMember(setup.owner, setup.business, staff, "STAFF");

      const stream = await listen(`/api/businesses/${setup.business.id}/chat-events`, staff);

      provider.script({ tools: [{ name: "handoff_to_human", args: { reason: "Wants a person" } }] }, { text: "Someone will follow up." });
      await postStream({ clientMessageId: randomUUID(), content: "Can I talk to someone?", timeZone: "UTC" }).expect(200);

      const types: string[] = [];

      while (!types.includes("handoff")) types.push(JSON.parse((await stream.next!()).data).type);

      expect(types).toContain("message");
      stream.close();
    });
  });
});
