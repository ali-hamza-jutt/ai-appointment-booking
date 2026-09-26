import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import type {
  AppointmentExtractionResult,
  ExtractAppointmentRequest,
} from "../../src/integrations/ai/dto/ai.dto.js";
import { bookingService } from "../../src/modules/bookings/booking.service.js";
import { catalogService } from "../../src/modules/catalog/catalog.service.js";
import { ChatOrchestrationService } from "../../src/modules/chat/chat-orchestration.service.js";
import { chatService } from "../../src/modules/chat/chat.service.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup, type BookableSetup } from "../helpers/booking.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

/** Returns scripted extractions instead of calling the AI provider. */
class ScriptedAi {
  public next: AppointmentExtractionResult | null = null;

  public async extractAppointmentDetails(
    _request: ExtractAppointmentRequest,
  ): Promise<AppointmentExtractionResult> {
    if (!this.next) throw new Error("No scripted extraction");

    return this.next;
  }
}

function bookingIntent(serviceName: string, scheduledAt: string): AppointmentExtractionResult {
  return {
    intent: "BOOK_APPOINTMENT",
    appointmentContext: { serviceName, scheduledAt: new Date(scheduledAt) },
    missingFields: [],
    confirmationRequired: true,
    confidence: 0.9,
  };
}

describe("chat booking flow", () => {
  const ai = new ScriptedAi();
  const orchestration = new ChatOrchestrationService(ai, chatService, bookingService, catalogService);
  let setup: BookableSetup;
  let customer: TestUser;
  let sessionId: string;

  async function send(content: string) {
    return orchestration.processMessage(customer.id, sessionId, {
      clientMessageId: randomUUID(),
      content,
      timeZone: "UTC",
    });
  }

  beforeEach(async () => {
    await resetDatabase();
    setup = await createBookableSetup();
    customer = await createTestUser();

    const session = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(customer))
      .send({ businessSlug: setup.business.slug })
      .expect(201);

    expect(session.body.business).toMatchObject({ slug: setup.business.slug });
    sessionId = session.body.id;
  });

  afterAll(disconnectTestDatabase);

  it("matches the service, holds the slot and confirms it", async () => {
    ai.next = bookingIntent("hair cut", setup.at("10:00"));

    const turn = await send("A hair cut next Tuesday at 10");

    expect(turn.assistantMessage.structuredData).toMatchObject({
      confirmationRequired: true,
      missingFields: [],
    });
    expect(turn.assistantMessage.content).toContain("Haircut with Sana");
    expect(turn.session.bookingContext).toMatchObject({
      serviceName: "Haircut",
      serviceId: setup.serviceId,
      staffId: setup.staffId,
      priceMinor: 3_000,
    });

    const holdId = turn.session.bookingContext?.holdBookingId as string;
    const confirmed = await orchestration.confirmBooking(customer.id, sessionId);

    expect(confirmed.appointment).toMatchObject({ id: holdId, status: "CONFIRMED" });
    expect(confirmed.session.status).toBe("CLOSED");
    expect(confirmed.assistantMessage.content).toContain("has been booked");

    const booking = await prisma.booking.findFirstOrThrow({
      where: { id: holdId, businessId: setup.business.id },
      select: { chatSessionId: true, source: true },
    });

    expect(booking).toEqual({ chatSessionId: sessionId, source: "CHAT" });

    // A repeated confirmation returns the same booking.
    const again = await orchestration.confirmBooking(customer.id, sessionId);

    expect(again.appointment.id).toBe(holdId);
  });

  it("offers the business's services when the request does not match", async () => {
    ai.next = bookingIntent("tattoo", setup.at("10:00"));

    const turn = await send("I want a tattoo");

    expect(turn.assistantMessage.content).toContain("You can book Haircut");
    expect(turn.assistantMessage.structuredData).toMatchObject({
      missingFields: ["serviceName"],
      confirmationRequired: false,
    });
  });

  it("suggests the closest open times when the slot is taken", async () => {
    const other = await createTestUser();
    await bookSlot(other, setup, setup.at("10:00"));
    ai.next = bookingIntent("Haircut", setup.at("10:00"));

    const turn = await send("Haircut at 10");
    const suggested = turn.assistantMessage.structuredData?.suggestedTimes ?? [];

    expect(turn.assistantMessage.structuredData?.confirmationRequired).toBe(false);
    expect(suggested.map((time) => new Date(time).toISOString())).toEqual([
      setup.at("11:00"),
      setup.at("12:00"),
      setup.at("13:00"),
    ]);
    expect(turn.assistantMessage.content).toContain("isn't available");
  });

  it("releases the previous hold when the customer changes the time", async () => {
    ai.next = bookingIntent("Haircut", setup.at("10:00"));
    const first = await send("Haircut at 10");
    const firstHold = first.session.bookingContext?.holdBookingId as string;

    ai.next = bookingIntent("Haircut", setup.at("14:00"));
    const second = await send("Actually make it 2pm");

    expect(second.session.bookingContext?.holdBookingId).not.toBe(firstHold);

    const released = await prisma.booking.findFirstOrThrow({
      where: { id: firstHold, businessId: setup.business.id },
      select: { status: true },
    });

    expect(released.status).toBe("CANCELLED");
  });

  it("keeps the same hold when the request is repeated", async () => {
    ai.next = bookingIntent("Haircut", setup.at("10:00"));
    const first = await send("Haircut at 10");
    const second = await send("Yes, Haircut at 10 please");

    expect(second.session.bookingContext?.holdBookingId).toBe(
      first.session.bookingContext?.holdBookingId,
    );
  });

  it("books from the structured form using a service id", async () => {
    const turn = await orchestration.processMessage(customer.id, sessionId, {
      clientMessageId: randomUUID(),
      content: "I completed the booking form.",
      timeZone: "UTC",
      bookingDetails: {
        serviceId: setup.serviceId,
        scheduledDate: setup.day,
        scheduledTime: "15:00",
      },
    });

    expect(turn.assistantMessage.structuredData?.confirmationRequired).toBe(true);
    expect(turn.session.bookingContext?.scheduledAt?.toISOString()).toBe(setup.at("15:00"));
  });
});
