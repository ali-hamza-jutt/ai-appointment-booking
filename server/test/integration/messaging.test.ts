import request from "supertest";
import express from "express";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { MESSAGING_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { bookingMaintenanceService } from "../../src/modules/bookings/booking-maintenance.service.js";
import type { SmsMessage, SmsSender } from "../../src/infrastructure/messaging/sms-sender.js";
import { twilioSignature } from "../../src/infrastructure/messaging/twilio-signature.js";
import { ChatOrchestrationService } from "../../src/modules/chat/chat-orchestration.service.js";
import { createTwilioInboundRouter } from "../../src/modules/messaging/controllers/twilio-inbound.routes.js";
import type { InboundMessageJobData } from "../../src/modules/messaging/dto/messaging.dto.js";
import { MessagingService } from "../../src/modules/messaging/messaging.service.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import { createBookableSetup, type BookableSetup } from "../helpers/booking.js";
import { addTestMember, createTestBusiness } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { ScriptedProvider } from "../helpers/scripted-provider.js";

const CUSTOMER = "whatsapp:+447700900555";
const BUSINESS_NUMBER = "whatsapp:+15550002222";

describe("SMS and WhatsApp", () => {
  let setup: BookableSetup;
  let sent: SmsMessage[];
  let service: MessagingService;
  let provider: ScriptedProvider;
  let sequence = 0;

  const sender: SmsSender = {
    isAvailable: true,
    send: (message) => {
      sent.push(message);
      return Promise.resolve({ providerMessageId: `SM-out-${sent.length}` });
    },
  };

  function inbound(body: string, extra: Partial<InboundMessageJobData> = {}): InboundMessageJobData {
    sequence += 1;

    return {
      businessId: setup.business.id,
      channel: "WHATSAPP",
      from: CUSTOMER,
      to: BUSINESS_NUMBER,
      body,
      messageSid: `SM-in-${sequence}`,
      profileName: "Zara Ali",
      ...extra,
    };
  }

  beforeEach(async () => {
    await resetDatabase();
    sent = [];
    provider = new ScriptedProvider();
    service = new MessagingService(new ChatOrchestrationService(provider), sender);
    setup = await createBookableSetup({ daysAhead: 2 });
  });

  afterAll(disconnectTestDatabase);

  it("books over WhatsApp: numbered times, a number to pick one, and YES to confirm", async () => {
    provider.script(
      { tools: [{ name: "get_availability", args: { serviceId: setup.serviceId, date: setup.day } }] },
      { text: "Here are some times that day." },
    );
    await service.handleInbound(inbound("Hi! Can I get a haircut?"));

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: CUSTOMER, from: BUSINESS_NUMBER });
    expect(sent[0]?.text).toMatch(/^Here are some times that day\.\n\n1\. .+\n2\. .+/);
    expect(sent[0]?.text).toMatch(/Reply with a number\.$/);

    // The number becomes an account with a verified phone and no real email.
    const user = await prisma.user.findUniqueOrThrow({
      where: { phone: "+447700900555" },
      select: { id: true, fullName: true, email: true, phoneVerifiedAt: true, emailVerifiedAt: true },
    });

    expect(user).toMatchObject({
      fullName: "Zara Ali",
      email: `447700900555@${MESSAGING_CONSTANTS.PLACEHOLDER_EMAIL_DOMAIN}`,
      phoneVerifiedAt: expect.any(Date),
      emailVerifiedAt: null,
    });
    expect(
      await prisma.customer.findFirst({ where: { businessId: setup.business.id, userId: user.id }, select: { email: true, phone: true } }),
    ).toEqual({ email: null, phone: "+447700900555" });
    expect(
      await prisma.chatSession.findFirst({
        where: { userId: user.id },
        select: { channel: true, customerAddress: true, businessAddress: true },
      }),
    ).toEqual({ channel: "WHATSAPP", customerAddress: CUSTOMER, businessAddress: BUSINESS_NUMBER });

    // "2" picks the second time without asking the assistant.
    const secondTime = /\n2\. (.+)/.exec(sent[0]?.text ?? "")?.[1];

    await service.handleInbound(inbound("2"));

    expect(provider.requests).toHaveLength(2);
    expect(sent[1]?.text).toMatch(/Reply YES to confirm booking\.$/);

    await service.handleInbound(inbound("Yes"));

    const booking = await prisma.booking.findFirstOrThrow({
      where: { businessId: setup.business.id, userId: user.id },
      select: { status: true, scheduledAt: true },
    });

    expect(booking.status).toBe("CONFIRMED");
    expect(secondTime).toContain(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(booking.scheduledAt),
    );
    expect(sent).toHaveLength(3);

    // A message Twilio delivers twice is one chat message.
    const repeated = inbound("Thanks!");

    provider.script({ text: "You're welcome!" });
    await service.handleInbound(repeated);
    await service.handleInbound(repeated);

    expect(await prisma.chatMessage.count({ where: { content: "Thanks!" } })).toBe(1);
  });

  it("texts back a refusal instead of failing, and sends staff replies to the phone", async () => {
    const sms = { channel: "SMS" as const, from: "+447700900666", to: "+15550001111", profileName: null };

    provider.script(
      { tools: [{ name: "get_availability", args: { serviceId: setup.serviceId, date: setup.day } }] },
      { text: "Here are some times." },
    );
    await service.handleInbound(inbound("Haircut please", sms));
    await service.handleInbound(inbound("1", sms));

    expect(await prisma.user.findUniqueOrThrow({ where: { phone: "+447700900666" }, select: { fullName: true } })).toEqual({
      fullName: "Customer 0666",
    });

    // The hold lapses before they answer, so YES can't book it.
    await prisma.booking.updateMany({
      where: { businessId: setup.business.id, status: "HELD" },
      data: { holdExpiresAt: new Date(Date.now() - 1_000) },
    });
    await bookingMaintenanceService.expireLapsedHolds();
    await service.handleInbound(inbound("yes", sms));

    expect(sent).toHaveLength(3);
    expect(sent[2]?.text).toBe("That time isn't held for you any more. Tell me when you'd like to come and I'll find another.");
    expect(await prisma.booking.count({ where: { businessId: setup.business.id, status: "CONFIRMED" } })).toBe(0);

    await service.relayStaffReply(
      { businessId: setup.business.id, channel: "SMS", customerAddress: "+447700900666", businessAddress: "+15550001111" },
      "Sana",
      "Glow Salon",
      "We've fixed that for you.",
    );
    await service.relayStaffReply({ businessId: setup.business.id, channel: "WEB", customerAddress: null, businessAddress: null }, "Sana", "Glow Salon", "Hi");

    expect(sent.at(-1)).toEqual({ to: "+447700900666", from: "+15550001111", text: "Sana from Glow Salon: We've fixed that for you." });
    expect(sent.filter((message) => message.text.startsWith("Sana"))).toHaveLength(1);
  });

  it("lets owners connect numbers and shows where Twilio should send messages", async () => {
    const base = `/api/businesses/${setup.business.id}/messaging-numbers`;
    const sms = await request(app).post(base).set(...authHeader(setup.owner)).send({ channel: "SMS", number: "+1 555 000 1111" }).expect(201);

    expect(sms.body).toMatchObject({ channel: "SMS", number: "+15550001111" });
    expect((await request(app).post(base).set(...authHeader(setup.owner)).send({ channel: "SMS", number: "+15550001111" }).expect(201)).body.id).toBe(
      sms.body.id,
    );
    await request(app).post(base).set(...authHeader(setup.owner)).send({ channel: "WHATSAPP", number: "+15550001111" }).expect(201);
    await request(app).post(base).set(...authHeader(setup.owner)).send({ channel: "SMS", number: "12" }).expect(422);

    const otherOwner = await createTestUser();
    const other = await createTestBusiness(otherOwner, { timeZone: "UTC", currency: "USD" });

    await request(app)
      .post(`/api/businesses/${other.id}/messaging-numbers`)
      .set(...authHeader(otherOwner))
      .send({ channel: "SMS", number: "+15550001111" })
      .expect(409);

    const staff = await createTestUser();

    await addTestMember(setup.owner, setup.business, staff, "STAFF");
    await request(app).post(base).set(...authHeader(staff)).send({ channel: "SMS", number: "+15550003333" }).expect(403);

    const listed = await request(app).get(base).set(...authHeader(setup.owner)).expect(200);

    expect(listed.body.items).toHaveLength(2);
    expect(listed.body.webhookUrl).toBe(`${env.API_PUBLIC_URL}${MESSAGING_CONSTANTS.INBOUND_PATH}`);

    await request(app).delete(`${base}/${sms.body.id}`).set(...authHeader(setup.owner)).expect(204);
    await request(app).delete(`${base}/${sms.body.id}`).set(...authHeader(setup.owner)).expect(404);
  });

  it("queues only messages Twilio signed, for numbers a business connected", async () => {
    const queued: InboundMessageJobData[] = [];
    const webhook = express()
      .use(express.urlencoded({ extended: false }))
      .use(createTwilioInboundRouter((job) => {
        queued.push(job);
        return Promise.resolve();
      }));
    const path = MESSAGING_CONSTANTS.INBOUND_PATH;
    const fields = { From: CUSTOMER, To: BUSINESS_NUMBER, Body: "Hello", MessageSid: "SM-hook-1", ProfileName: "Zara" };

    await request(webhook).post(path).type("form").send(fields).expect(404);

    const original = env.TWILIO_AUTH_TOKEN;

    env.TWILIO_AUTH_TOKEN = "test-twilio-token";

    try {
      const sign = (body: Record<string, string>) =>
        twilioSignature("test-twilio-token", `${env.API_PUBLIC_URL}${path}`, body);

      await request(webhook).post(path).type("form").set("X-Twilio-Signature", "forged").send(fields).expect(403);

      // Nobody has connected this number yet.
      await request(webhook).post(path).type("form").set("X-Twilio-Signature", sign(fields)).send(fields).expect(200);
      expect(queued).toHaveLength(0);

      await request(app)
        .post(`/api/businesses/${setup.business.id}/messaging-numbers`)
        .set(...authHeader(setup.owner))
        .send({ channel: "WHATSAPP", number: "+15550002222" })
        .expect(201);

      const answer = await request(webhook).post(path).type("form").set("X-Twilio-Signature", sign(fields)).send(fields).expect(200);

      expect(answer.headers["content-type"]).toMatch(/^text\/xml/);
      expect(answer.text).toContain("<Response></Response>");
      expect(queued).toEqual([
        {
          businessId: setup.business.id,
          channel: "WHATSAPP",
          from: CUSTOMER,
          to: BUSINESS_NUMBER,
          body: "Hello",
          messageSid: "SM-hook-1",
          profileName: "Zara",
        },
      ]);
    } finally {
      env.TWILIO_AUTH_TOKEN = original;
    }
  });
});
