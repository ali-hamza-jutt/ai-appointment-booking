import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { JOB_CONSTANTS, NOTIFICATION_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import type { EmailMessage, Mailer } from "../../src/infrastructure/messaging/mailer.js";
import {
  SmsProviderError,
  type SmsMessage,
  type SmsSender,
} from "../../src/infrastructure/messaging/sms-sender.js";
import { twilioSignature } from "../../src/infrastructure/messaging/twilio-signature.js";
import { createQueue } from "../../src/infrastructure/queue/queues.js";
import type { PlannedReminder } from "../../src/modules/notifications/dto/notification.dto.js";
import { NotificationService } from "../../src/modules/notifications/notification.service.js";
import {
  QueueReminderScheduler,
  reminderJobId,
  type ReminderScheduler,
} from "../../src/modules/notifications/reminder-scheduler.js";
import type { OutboxMessage } from "../../src/modules/outbox/dto/outbox.dto.js";
import { bookingNotificationsConsumer } from "../../src/modules/outbox/outbox-consumers.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup, holdSlot, type BookableSetup } from "../helpers/booking.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { resetRedis } from "../helpers/redis.js";

class FakeScheduler implements ReminderScheduler {
  public scheduled: Array<{ bookingId: string; scheduledAt: string; reminders: PlannedReminder[] }> = [];
  public cancelled: Array<{ bookingId: string; offsets: number[] }> = [];

  public schedule(booking: { bookingId: string; scheduledAt: Date }, reminders: PlannedReminder[]): Promise<void> {
    this.scheduled.push({ bookingId: booking.bookingId, scheduledAt: booking.scheduledAt.toISOString(), reminders });
    return Promise.resolve();
  }

  public cancel(booking: { bookingId: string }, offsets: readonly number[]): Promise<void> {
    this.cancelled.push({ bookingId: booking.bookingId, offsets: [...offsets] });
    return Promise.resolve();
  }

  public reviewRequests: Array<{ bookingId: string; sendAt: string }> = [];

  public scheduleReviewRequest(booking: { bookingId: string }, sendAt: Date): Promise<void> {
    this.reviewRequests.push({ bookingId: booking.bookingId, sendAt: sendAt.toISOString() });
    return Promise.resolve();
  }
}

describe("booking notifications", () => {
  let emails: EmailMessage[];
  let texts: SmsMessage[];
  let failNextEmail: boolean;
  let rejectTexts: SmsProviderError | null;
  let scheduler: FakeScheduler;
  let service: NotificationService;
  let setup: BookableSetup;
  let customer: TestUser;

  const mailer: Mailer = {
    send: (message) => {
      if (failNextEmail) {
        failNextEmail = false;
        return Promise.reject(new Error("SMTP unavailable"));
      }

      emails.push(message);
      return Promise.resolve();
    },
  };
  const sms: SmsSender = {
    isAvailable: true,
    send: (message) => {
      if (rejectTexts) return Promise.reject(rejectTexts);

      texts.push(message);
      return Promise.resolve({ providerMessageId: `SM${texts.length}` });
    },
  };

  /** The booking's latest outbox event of a type, as the worker would receive it. */
  async function eventFor(bookingId: string, type: string): Promise<OutboxMessage> {
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: bookingId, type },
      orderBy: { createdAt: "desc" },
    });

    return {
      id: event.id,
      type: event.type,
      businessId: event.businessId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Record<string, unknown>,
      createdAt: event.createdAt.toISOString(),
    };
  }

  async function deliver(bookingId: string, type: string): Promise<void> {
    await service.handleBookingEvent(await eventFor(bookingId, type));
  }

  function notifications(bookingId: string) {
    return prisma.notification.findMany({
      where: { businessId: setup.business.id, bookingId },
      orderBy: [{ kind: "asc" }, { channel: "asc" }],
      select: { channel: true, kind: true, status: true, recipient: true, providerMessageId: true },
    });
  }

  beforeEach(async () => {
    await resetDatabase();
    emails = [];
    texts = [];
    failNextEmail = false;
    rejectTexts = null;
    scheduler = new FakeScheduler();
    service = new NotificationService(scheduler, mailer, sms);
    setup = await createBookableSetup({ daysAhead: 2 });
    customer = await createTestUser({ fullName: "Ayesha Khan", email: `ayesha.${Date.now()}@example.com` });
  });

  afterAll(disconnectTestDatabase);

  async function bookWithPhone(time = "15:00"): Promise<string> {
    const bookingId = await bookSlot(customer, setup, setup.at(time));

    await prisma.customer.updateMany({
      where: { businessId: setup.business.id, userId: customer.id },
      data: { phone: "+44 7700 900123" },
    });

    return bookingId;
  }

  it("emails and texts a confirmation with a calendar invite, and plans reminders", async () => {
    const bookingId = await bookWithPhone();

    expect(bookingNotificationsConsumer.handles("booking.confirmed")).toBe(true);
    expect(bookingNotificationsConsumer.handles("booking.held")).toBe(false);

    await deliver(bookingId, "booking.confirmed");

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: customer.email, subject: expect.stringMatching(/^Booked: Haircut on .+ at 3:00 PM$/) });
    expect(emails[0]?.text).toContain("Hi Ayesha,");
    expect(emails[0]?.text).toContain(`/appointments/${bookingId}`);
    expect(emails[0]?.calendarEvent?.method).toBe("REQUEST");
    expect(emails[0]?.calendarEvent?.content).toContain(`DTSTART:${setup.day.replace(/-/g, "")}T150000Z`);

    expect(texts).toEqual([
      expect.objectContaining({
        to: "+447700900123",
        text: expect.stringContaining("your Haircut is booked"),
        statusCallback: `${env.API_PUBLIC_URL}${NOTIFICATION_CONSTANTS.TWILIO_STATUS_PATH}`,
      }),
    ]);
    expect(await notifications(bookingId)).toEqual([
      expect.objectContaining({ channel: "EMAIL", kind: "BOOKING_CONFIRMED", status: "SENT", recipient: customer.email }),
      expect.objectContaining({ channel: "SMS", kind: "BOOKING_CONFIRMED", status: "SENT", providerMessageId: "SM1" }),
    ]);

    // Default offsets are 24 hours and 2 hours; the visit is two days out at 15:00 UTC.
    const start = new Date(setup.at("15:00")).getTime();

    expect(scheduler.scheduled).toEqual([
      {
        bookingId,
        scheduledAt: setup.at("15:00"),
        reminders: [
          { offsetMinutes: 1_440, sendAt: new Date(start - 1_440 * 60_000) },
          { offsetMinutes: 120, sendAt: new Date(start - 120 * 60_000) },
        ],
      },
    ]);
  });

  it("sends each message once when an event arrives again", async () => {
    const bookingId = await bookWithPhone();

    await deliver(bookingId, "booking.confirmed");
    await deliver(bookingId, "booking.confirmed");

    expect(emails).toHaveLength(1);
    expect(texts).toHaveLength(1);
  });

  it("retries only the channel that failed", async () => {
    const bookingId = await bookWithPhone();

    failNextEmail = true;
    await expect(deliver(bookingId, "booking.confirmed")).rejects.toThrow("SMTP unavailable");

    expect(texts).toHaveLength(1);
    expect(await notifications(bookingId)).toEqual([
      expect.objectContaining({ channel: "EMAIL", status: "FAILED" }),
      expect.objectContaining({ channel: "SMS", status: "SENT" }),
    ]);

    await deliver(bookingId, "booking.confirmed");

    expect(emails).toHaveLength(1);
    expect(texts).toHaveLength(1);
  });

  it("gives up on a number the SMS provider refuses, without failing the event", async () => {
    const bookingId = await bookWithPhone();

    rejectTexts = new SmsProviderError("The 'To' number is not a valid phone number.", false, "21211");
    await deliver(bookingId, "booking.confirmed");

    expect(emails).toHaveLength(1);
    expect(await notifications(bookingId)).toEqual([
      expect.objectContaining({ channel: "EMAIL", status: "SENT" }),
      expect.objectContaining({ channel: "SMS", status: "FAILED" }),
    ]);
  });

  it("respects a customer who turned texts off", async () => {
    const bookingId = await bookWithPhone();

    const settings = await request(app).get("/api/me/notification-settings").set(...authHeader(customer)).expect(200);

    expect(settings.body.items).toEqual([
      { business: expect.objectContaining({ id: setup.business.id }), email: true, sms: true },
    ]);

    await request(app)
      .put(`/api/me/notification-settings/${setup.business.id}`)
      .set(...authHeader(customer))
      .send({ channel: "SMS", optedIn: false })
      .expect(204);
    await deliver(bookingId, "booking.confirmed");

    expect(emails).toHaveLength(1);
    expect(texts).toHaveLength(0);
    expect(await notifications(bookingId)).toEqual([
      expect.objectContaining({ channel: "EMAIL", status: "SENT" }),
      expect.objectContaining({ channel: "SMS", status: "SKIPPED" }),
    ]);

    // A business the user never booked with can't be switched.
    const other = await createBookableSetup();

    await request(app)
      .put(`/api/me/notification-settings/${other.business.id}`)
      .set(...authHeader(customer))
      .send({ channel: "EMAIL", optedIn: false })
      .expect(404);
  });

  it("sends a cancellation that removes the calendar event and drops reminders", async () => {
    const bookingId = await bookWithPhone();

    await request(app).patch(`/api/appointments/${bookingId}/cancel`).set(...authHeader(customer)).send({}).expect(200);
    await deliver(bookingId, "booking.cancelled");

    expect(emails[0]?.subject).toMatch(/^Cancelled: Haircut on /);
    expect(emails[0]?.calendarEvent?.method).toBe("CANCEL");
    expect(emails[0]?.calendarEvent?.content).toContain("SEQUENCE:1");
    expect(texts[0]?.text).toContain("is cancelled");
    expect(scheduler.cancelled).toEqual([{ bookingId, offsets: [1_440, 120] }]);

    // The confirmation for the same booking, arriving late, sends nothing.
    await deliver(bookingId, "booking.confirmed");
    expect(emails).toHaveLength(1);
  });

  it("sends nothing when a hold that was never confirmed is released", async () => {
    const hold = await holdSlot(customer, setup, setup.at("11:00")).expect(201);

    await request(app).patch(`/api/appointments/${hold.body.id}/cancel`).set(...authHeader(customer)).send({}).expect(200);
    await deliver(hold.body.id, "booking.cancelled");

    expect(emails).toHaveLength(0);
  });

  it("sends an updated invite when a booking moves, and ignores the stale confirmation", async () => {
    const bookingId = await bookWithPhone();

    await request(app)
      .patch(`/api/appointments/${bookingId}/reschedule`)
      .set(...authHeader(customer))
      .send({ scheduledDate: setup.day, scheduledTime: "16:00" })
      .expect(200);

    await deliver(bookingId, "booking.confirmed");
    expect(emails).toHaveLength(0);

    await deliver(bookingId, "booking.rescheduled");

    expect(emails[0]?.subject).toMatch(/^Moved: Haircut is now on .+ at 4:00 PM$/);
    expect(emails[0]?.calendarEvent?.content).toContain("SEQUENCE:1");
    expect(emails[0]?.calendarEvent?.content).toContain(`DTSTART:${setup.day.replace(/-/g, "")}T160000Z`);
    expect(scheduler.scheduled.at(-1)?.scheduledAt).toBe(setup.at("16:00"));
  });

  it("tells the customer a request is waiting for approval", async () => {
    await request(app)
      .patch(`/api/businesses/${setup.business.id}/settings`)
      .set(...authHeader(setup.owner))
      .send({ autoConfirmBookings: false })
      .expect(200);

    const hold = await holdSlot(customer, setup, setup.at("10:00")).expect(201);

    await request(app).post(`/api/appointments/${hold.body.id}/confirm`).set(...authHeader(customer)).expect(200);
    await deliver(hold.body.id, "booking.pending_approval");

    expect(emails[0]?.subject).toMatch(/^Request received: Haircut on /);
    expect(emails[0]?.calendarEvent).toBeUndefined();
    expect(scheduler.scheduled).toHaveLength(0);
  });

  it("sends a reminder once, and not for a booking that moved or was cancelled", async () => {
    const bookingId = await bookWithPhone();
    const job = { bookingId, businessId: setup.business.id, offsetMinutes: 120, scheduledAt: setup.at("15:00") };

    await service.sendReminder(job);
    await service.sendReminder(job);

    expect(emails).toHaveLength(1);
    expect(emails[0]?.subject).toMatch(/^Reminder: Haircut on .+ at 3:00 PM$/);
    expect(texts[0]?.text).toMatch(/^Reminder from /);

    await service.sendReminder({ ...job, scheduledAt: setup.at("14:00") });
    await service.sendReminder({ ...job, offsetMinutes: 30 });
    expect(emails).toHaveLength(1);

    await request(app).patch(`/api/appointments/${bookingId}/cancel`).set(...authHeader(customer)).send({}).expect(200);
    await service.sendReminder({ ...job, offsetMinutes: 1_440 });
    expect(emails).toHaveLength(1);
  });

  it("asks for a review two hours after a visit, once, and not after the customer left one", async () => {
    const bookingId = await bookWithPhone();
    const base = `/api/businesses/${setup.business.id}/bookings/${bookingId}`;
    const job = { bookingId, businessId: setup.business.id };

    // Not before the visit is over.
    await service.sendReviewRequest(job);
    expect(emails).toHaveLength(0);

    await request(app).post(`${base}/check-in`).set(...authHeader(setup.owner)).expect(200);
    await request(app).post(`${base}/complete`).set(...authHeader(setup.owner)).expect(200);

    const completed = await eventFor(bookingId, "booking.completed");

    expect(bookingNotificationsConsumer.handles("booking.completed")).toBe(true);
    await service.handleBookingEvent(completed);
    expect(scheduler.reviewRequests).toEqual([
      { bookingId, sendAt: new Date(new Date(completed.createdAt).getTime() + 2 * 60 * 60_000).toISOString() },
    ]);
    expect(emails).toHaveLength(0);

    await service.sendReviewRequest(job);
    await service.sendReviewRequest(job);

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: customer.email, subject: "How was your Haircut?" });
    expect(emails[0]?.text).toContain(`/appointments/${bookingId}`);
    expect(texts[0]?.text).toMatch(/How was your Haircut\? Rate it from 1 to 5: /);

    // A customer who already reviewed the visit isn't asked again.
    await prisma.notification.deleteMany({ where: { businessId: setup.business.id, bookingId } });
    await request(app).post(`/api/appointments/${bookingId}/review`).set(...authHeader(customer)).send({ rating: 5 }).expect(201);
    await service.sendReviewRequest(job);
    expect(emails).toHaveLength(1);
  });

  it("uses the business's own wording and rejects unknown placeholders", async () => {
    const base = `/api/businesses/${setup.business.id}/notification-templates`;

    await request(app)
      .put(`${base}/EMAIL/BOOKING_CONFIRMED`)
      .set(...authHeader(setup.owner))
      .send({ subject: "See you {{date}}!", body: "{{customerName}}, {{serviceName}} with {{staffName}} is set." })
      .expect(200);

    const invalid = await request(app)
      .put(`${base}/SMS/BOOKING_REMINDER`)
      .set(...authHeader(setup.owner))
      .send({ body: "Hi {{firstName}}" })
      .expect(422);

    expect(invalid.body.error.fieldErrors.body).toEqual(["Unknown placeholder {{firstName}}"]);
    await request(app).put(`${base}/PUSH/BOOKING_REMINDER`).set(...authHeader(setup.owner)).send({ body: "x" }).expect(404);

    const listed = await request(app).get(base).set(...authHeader(setup.owner)).expect(200);

    // Seven kinds of message, each by email and SMS.
    expect(listed.body.items).toHaveLength(14);
    expect(listed.body.items.filter((item: { isCustom: boolean }) => item.isCustom)).toEqual([
      expect.objectContaining({ channel: "EMAIL", kind: "BOOKING_CONFIRMED", subject: "See you {{date}}!" }),
    ]);

    const bookingId = await bookSlot(customer, setup, setup.at("15:00"));

    await deliver(bookingId, "booking.confirmed");

    expect(emails[0]?.subject).toMatch(/^See you .+!$/);
    expect(emails[0]?.text).toBe("Ayesha, Haircut with Sana is set.");

    await request(app).delete(`${base}/EMAIL/BOOKING_CONFIRMED`).set(...authHeader(setup.owner)).expect(204);

    const reset = await request(app).get(base).set(...authHeader(setup.owner)).expect(200);

    expect(reset.body.items.some((item: { isCustom: boolean }) => item.isCustom)).toBe(false);

    // Staff see what was sent for the booking.
    const log = await request(app)
      .get(`/api/businesses/${setup.business.id}/bookings/${bookingId}/notifications`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(log.body.items).toEqual([
      expect.objectContaining({ channel: "EMAIL", kind: "BOOKING_CONFIRMED", status: "SENT" }),
    ]);
  });

  it("records SMS delivery reports that carry a valid Twilio signature", async () => {
    const bookingId = await bookWithPhone();

    await deliver(bookingId, "booking.confirmed");

    const path = NOTIFICATION_CONSTANTS.TWILIO_STATUS_PATH;
    const fields = { MessageSid: "SM1", MessageStatus: "delivered", AccountSid: "AC1" };

    await request(app).post(path).type("form").send(fields).expect(404);

    const original = env.TWILIO_AUTH_TOKEN;

    env.TWILIO_AUTH_TOKEN = "test-twilio-token";

    try {
      const url = `${env.API_PUBLIC_URL}${path}`;

      await request(app).post(path).type("form").set("X-Twilio-Signature", "forged").send(fields).expect(403);
      await request(app)
        .post(path)
        .type("form")
        .set("X-Twilio-Signature", twilioSignature("test-twilio-token", url, fields))
        .send(fields)
        .expect(204);

      // A late "sent" report does not undo the delivery.
      const late = { ...fields, MessageStatus: "sent" };

      await request(app)
        .post(path)
        .type("form")
        .set("X-Twilio-Signature", twilioSignature("test-twilio-token", url, late))
        .send(late)
        .expect(204);
    } finally {
      env.TWILIO_AUTH_TOKEN = original;
    }

    const sms = await prisma.notification.findFirstOrThrow({
      where: { businessId: setup.business.id, bookingId, channel: "SMS" },
      select: { status: true, deliveredAt: true },
    });

    expect(sms.status).toBe("DELIVERED");
    expect(sms.deliveredAt).toBeInstanceOf(Date);
  });
});

describe("reminder queue", () => {
  beforeEach(resetRedis);

  it("adds each reminder once as a delayed job and removes it on cancel", async () => {
    const scheduler = new QueueReminderScheduler();
    const queue = createQueue(JOB_CONSTANTS.QUEUES.NOTIFICATIONS);
    const now = new Date("2026-10-05T12:00:00Z");
    const booking = {
      bookingId: "11111111-1111-4111-8111-111111111111",
      businessId: "22222222-2222-4222-8222-222222222222",
      scheduledAt: new Date("2026-10-08T15:00:00Z"),
    };
    const reminders = [{ offsetMinutes: 120, sendAt: new Date("2026-10-08T13:00:00Z") }];

    try {
      await scheduler.schedule(booking, reminders, now);
      await scheduler.schedule(booking, reminders, now);

      const id = reminderJobId(booking.bookingId, booking.scheduledAt, 120);
      const job = await queue.getJob(id);

      expect(job?.name).toBe(NOTIFICATION_CONSTANTS.REMINDER_JOB);
      expect(job?.data).toEqual({ ...booking, offsetMinutes: 120, scheduledAt: "2026-10-08T15:00:00.000Z" });
      expect(job?.opts.delay).toBe(73 * 60 * 60 * 1_000);
      expect(await queue.getDelayedCount()).toBe(1);

      await scheduler.cancel(booking, [1_440, 120]);

      expect(await queue.getJob(id)).toBeUndefined();

      // One review request per booking, however often the visit's event arrives.
      const reviewAt = new Date("2026-10-05T14:00:00Z");

      await scheduler.scheduleReviewRequest(booking, reviewAt, now);
      await scheduler.scheduleReviewRequest(booking, reviewAt, now);

      const reviewJob = await queue.getJob(`review-request-${booking.bookingId}`);

      expect(reviewJob?.name).toBe(NOTIFICATION_CONSTANTS.REVIEW_REQUEST_JOB);
      expect(reviewJob?.data).toEqual({ bookingId: booking.bookingId, businessId: booking.businessId });
      expect(reviewJob?.opts.delay).toBe(2 * 60 * 60 * 1_000);
      expect(await queue.getDelayedCount()).toBe(1);
    } finally {
      await scheduler.close();
      await queue.close();
    }
  });
});
