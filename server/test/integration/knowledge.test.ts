import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { KNOWLEDGE_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { ChatOrchestrationService } from "../../src/modules/chat/chat-orchestration.service.js";
import { KnowledgeService } from "../../src/modules/knowledge/knowledge.service.js";
import { knowledgeIndexConsumer } from "../../src/modules/outbox/outbox-consumers.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { addTestMember, createTestBusiness, type TestBusiness } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { FakeEmbedder } from "../helpers/fake-embedder.js";
import { lastToolResult, ScriptedProvider } from "../helpers/scripted-provider.js";

const POLICY = `## Cancellations

You can cancel for free up to 24 hours before your appointment. Later cancellations are charged half the price.

## No-shows

Missed appointments are charged in full.`;

const PARKING = "## Parking\n\nFree parking is available behind the salon on Mill Lane.";

describe("knowledge base", () => {
  let owner: TestUser;
  let business: TestBusiness;

  function createSource(body: Record<string, unknown>, user: TestUser = owner) {
    return request(app)
      .post(`/api/businesses/${business.id}/knowledge-sources`)
      .set(...authHeader(user))
      .send(body);
  }

  function search(query: string, businessId = business.id) {
    return request(app)
      .post(`/api/businesses/${businessId}/knowledge-search`)
      .set(...authHeader(owner))
      .send({ query });
  }

  beforeEach(async () => {
    await resetDatabase();
    owner = await createTestUser();
    business = await createTestBusiness(owner);
  });

  afterAll(disconnectTestDatabase);

  it("stores a source as chunks and queues it for embedding", async () => {
    const created = await createSource({ title: " Booking  policy ", kind: "POLICY", content: POLICY }).expect(201);

    expect(created.body).toMatchObject({
      title: "Booking policy",
      kind: "POLICY",
      status: "PENDING",
      chunkCount: 1,
      content: POLICY,
    });

    const events = await prisma.outboxEvent.findMany({ where: { businessId: business.id } });

    expect(events).toEqual([
      expect.objectContaining({
        type: KNOWLEDGE_CONSTANTS.SOURCE_CHANGED_EVENT,
        aggregateId: created.body.id,
        payload: expect.objectContaining({ sourceId: created.body.id }),
      }),
    ]);

    const list = await request(app)
      .get(`/api/businesses/${business.id}/knowledge-sources`)
      .set(...authHeader(owner))
      .expect(200);

    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].preview).toMatch(/^Cancellations You can cancel/);
    expect(list.body.items[0]).not.toHaveProperty("content");
  });

  it("finds passages by keywords before anything is embedded", async () => {
    await createSource({ title: "Booking policy", kind: "POLICY", content: POLICY }).expect(201);
    await createSource({ title: "Getting here", kind: "FAQ", content: PARKING }).expect(201);

    const result = await search("How late can I cancel?").expect(200);

    expect(result.body.results[0]).toMatchObject({ sourceTitle: "Booking policy", matchedBy: ["keywords"] });
    expect(result.body.results.some((item: { sourceTitle: string }) => item.sourceTitle === "Getting here")).toBe(false);
  });

  it("never returns another business's passages", async () => {
    await createSource({ title: "Booking policy", content: POLICY }).expect(201);

    const other = await createTestBusiness(owner, { name: "Other Salon" });

    expect((await search("cancel", other.id).expect(200)).body.results).toEqual([]);
  });

  it("re-chunks changed content and only lets managers edit", async () => {
    const created = await createSource({ title: "Getting here", content: PARKING }).expect(201);
    const staff = await createTestUser();

    await addTestMember(owner, business, staff, "STAFF");
    await createSource({ title: "Nope", content: PARKING }, staff).expect(403);

    const renamed = await request(app)
      .patch(`/api/businesses/${business.id}/knowledge-sources/${created.body.id}`)
      .set(...authHeader(owner))
      .send({ title: "Directions" })
      .expect(200);

    expect(renamed.body.contentHash).toBeUndefined();
    expect(await prisma.outboxEvent.count({ where: { businessId: business.id } })).toBe(1);

    await request(app)
      .patch(`/api/businesses/${business.id}/knowledge-sources/${created.body.id}`)
      .set(...authHeader(owner))
      .send({ content: "Parking is now at the leisure centre across the road." })
      .expect(200);

    expect(await prisma.outboxEvent.count({ where: { businessId: business.id } })).toBe(2);
    expect((await search("leisure centre").expect(200)).body.results[0].sourceTitle).toBe("Directions");
    expect((await search("Mill Lane").expect(200)).body.results).toEqual([]);

    await request(app)
      .delete(`/api/businesses/${business.id}/knowledge-sources/${created.body.id}`)
      .set(...authHeader(owner))
      .expect(204);
    expect(await prisma.knowledgeChunk.count({ where: { businessId: business.id } })).toBe(0);
  });

  it("validates input and returns 404 for unknown sources", async () => {
    await createSource({ title: "x", content: "short" }).expect(422);
    await request(app)
      .get(`/api/businesses/${business.id}/knowledge-sources/${randomUUID()}`)
      .set(...authHeader(owner))
      .expect(404);
  });

  describe("with embeddings", () => {
    const embedder = new FakeEmbedder();
    const service = new KnowledgeService(embedder);

    async function hashOf(sourceId: string): Promise<string> {
      const source = await prisma.knowledgeSource.findFirstOrThrow({ where: { id: sourceId, businessId: business.id } });

      return source.contentHash;
    }

    beforeEach(() => {
      embedder.calls.length = 0;
      embedder.failWith = null;
    });

    it("embeds a source and finds it by meaning", async () => {
      const source = await service.createSource(business.id, { title: "Getting here", content: PARKING });

      await service.indexSource(business.id, source.id, await hashOf(source.id));

      expect((await service.getSource(business.id, source.id)).status).toBe("READY");

      // No shared keyword: "car" only matches "parking" by meaning.
      const { results } = await service.search(business.id, "Where do I leave my car?");

      expect(results[0]).toMatchObject({ sourceTitle: "Getting here", matchedBy: ["meaning"] });
    });

    it("runs from the outbox and skips superseded edits", async () => {
      const source = await service.createSource(business.id, { title: "Getting here", content: PARKING });
      const firstHash = await hashOf(source.id);

      await service.updateSource(business.id, source.id, { content: `${PARKING}\n\nBlue badge spaces are by the door.` });

      // The first version's hash is stale now, so indexing it does nothing.
      await service.indexSource(business.id, source.id, firstHash);
      expect(embedder.calls).toHaveLength(0);
      expect((await service.getSource(business.id, source.id)).status).toBe("PENDING");

      // The shared consumer uses the app's service, which has no embedder in tests: keyword-only READY.
      const [, latest] = await prisma.outboxEvent.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });

      await knowledgeIndexConsumer.handle({
        id: latest!.id,
        type: latest!.type,
        businessId: business.id,
        aggregateType: latest!.aggregateType,
        aggregateId: latest!.aggregateId,
        payload: latest!.payload as Record<string, unknown>,
        createdAt: latest!.createdAt.toISOString(),
      });
      expect((await service.getSource(business.id, source.id)).status).toBe("READY");
    });

    it("marks a source failed when embedding fails but still answers by keywords", async () => {
      const source = await service.createSource(business.id, { title: "Booking policy", content: POLICY });

      embedder.failWith = new Error("Mistral is down");
      await expect(service.indexSource(business.id, source.id, await hashOf(source.id))).rejects.toThrow(
        "Mistral is down",
      );

      expect(await service.getSource(business.id, source.id)).toMatchObject({ status: "FAILED", lastError: "Mistral is down" });
      expect((await service.search(business.id, "cancel my appointment")).results[0]?.matchedBy).toEqual(["keywords"]);
    });
  });

  describe("search_knowledge tool", () => {
    const provider = new ScriptedProvider();
    const orchestration = new ChatOrchestrationService(provider);

    async function startChat(): Promise<{ customer: TestUser; sessionId: string }> {
      const customer = await createTestUser();
      const session = await request(app)
        .post("/api/chat/sessions")
        .set(...authHeader(customer))
        .send({ businessSlug: business.slug })
        .expect(201);

      return { customer, sessionId: session.body.id };
    }

    it("gives the agent matching passages and tells it to answer from them", async () => {
      await createSource({ title: "Booking policy", kind: "POLICY", content: POLICY }).expect(201);

      const { customer, sessionId } = await startChat();

      provider.requests.length = 0;
      provider.script(
        { tools: [{ name: "search_knowledge", args: { query: "cancellation fee" } }] },
        (req) => {
          const result = lastToolResult<{ results: Array<{ source: string; text: string }> }>(req.messages, "search_knowledge");

          return { text: `Per our ${result.results[0]?.source}: free up to 24 hours before.` };
        },
      );

      const turn = await orchestration.processMessage(customer.id, sessionId, {
        clientMessageId: randomUUID(),
        content: "What happens if I cancel late?",
        timeZone: "UTC",
      });

      expect(turn.assistantMessage.content).toBe("Per our Booking policy: free up to 24 hours before.");
      expect(provider.requests[0]?.systemPrompt).toContain("search_knowledge");
    });

    it("tells the agent to say it doesn't know when nothing matches", async () => {
      const { customer, sessionId } = await startChat();

      provider.requests.length = 0;
      provider.script(
        { tools: [{ name: "search_knowledge", args: { query: "wheelchair access" } }] },
        { text: "I don't know, sorry." },
      );

      await orchestration.processMessage(customer.id, sessionId, {
        clientMessageId: randomUUID(),
        content: "Is there wheelchair access?",
        timeZone: "UTC",
      });

      const result = lastToolResult<{ results: unknown[]; next: string }>(provider.requests[1]!.messages, "search_knowledge");

      expect(result.results).toEqual([]);
      expect(result.next).toContain("don't know");
    });
  });
});
