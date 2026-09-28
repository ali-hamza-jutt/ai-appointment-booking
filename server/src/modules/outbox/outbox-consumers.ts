import { bookingMetrics } from "../../infrastructure/observability/metrics.js";
import {
  CALENDAR_CONSTANTS,
  CUSTOMER_PROFILE_CONSTANTS,
  KNOWLEDGE_CONSTANTS,
  NOTIFICATION_CONSTANTS,
  PAYMENT_CONSTANTS,
  WAITLIST_CONSTANTS,
} from "../../constants/app.constants.js";
import { availabilityCache } from "../availability/availability-cache.js";
import { calendarSyncService } from "../calendar/calendar-sync.service.js";
import { customerProfileService } from "../customers/customer-profile.service.js";
import { knowledgeService } from "../knowledge/knowledge.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { paymentService } from "../payments/payment.service.js";
import { waitlistService } from "../waitlist/waitlist.service.js";
import type { OutboxConsumer } from "./dto/outbox.dto.js";

const BOOKING_EVENT_PREFIX = "booking.";

/** Any booking change can open or close a slot for its business. */
export const availabilityCacheConsumer: OutboxConsumer = {
  name: "availability-cache",
  handles: (type) => type.startsWith(BOOKING_EVENT_PREFIX),
  async handle(message) {
    if (message.businessId) await availabilityCache.invalidate(message.businessId);
  },
};

/** Counts committed booking changes; running once per event keeps the counts exact. */
export const bookingMetricsConsumer: OutboxConsumer = {
  name: "booking-metrics",
  handles: (type) => type.startsWith(BOOKING_EVENT_PREFIX),
  handle(message) {
    bookingMetrics.event(message.type);

    return Promise.resolve();
  },
};

/** Re-embeds a knowledge source after it changes; stale hashes are skipped. */
export const knowledgeIndexConsumer: OutboxConsumer = {
  name: "knowledge-index",
  handles: (type) => type === KNOWLEDGE_CONSTANTS.SOURCE_CHANGED_EVENT,
  async handle(message) {
    const { businessId, sourceId, contentHash } = message.payload;

    if (typeof businessId !== "string" || typeof sourceId !== "string" || typeof contentHash !== "string") {
      return;
    }

    await knowledgeService.indexSource(businessId, sourceId, contentHash);
  },
};

/** A finished visit can make a service, provider or time of day the customer's usual one. */
export const customerPreferencesConsumer: OutboxConsumer = {
  name: "customer-preferences",
  handles: (type) => type === CUSTOMER_PROFILE_CONSTANTS.COMPLETED_EVENT,
  async handle(message) {
    const { businessId, customerId } = message.payload;

    if (typeof businessId !== "string" || typeof customerId !== "string") return;

    await customerProfileService.refreshFromHistory(businessId, customerId);
  },
};

const NOTIFYING_EVENTS = new Set<string>(Object.values(NOTIFICATION_CONSTANTS.EVENTS));

/** Emails and texts the customer about a confirmed, requested, moved or cancelled booking, and plans reminders. */
export const bookingNotificationsConsumer: OutboxConsumer = {
  name: "booking-notifications",
  handles: (type) => NOTIFYING_EVENTS.has(type),
  handle: (message) => notificationService.handleBookingEvent(message),
};

const CALENDAR_EVENTS = new Set<string>(CALENDAR_CONSTANTS.BOOKING_EVENTS);

/** Writes, moves or removes the booking's event in its staff member's connected calendar. */
export const calendarEventsConsumer: OutboxConsumer = {
  name: "calendar-events",
  handles: (type) => CALENDAR_EVENTS.has(type),
  async handle(message) {
    const { bookingId } = message.payload;

    if (!message.businessId || typeof bookingId !== "string") return;

    await calendarSyncService.reconcileBooking(message.businessId, bookingId);
  },
};

const PAYMENT_EVENTS = new Set<string>(Object.values(PAYMENT_CONSTANTS.EVENTS));

/** Refunds cancelled bookings by the cancellation policy and closes Checkout on bookings that ended unpaid. */
export const paymentsConsumer: OutboxConsumer = {
  name: "payments",
  handles: (type) => PAYMENT_EVENTS.has(type),
  handle: (message) => paymentService.handleBookingEvent(message),
};

const WAITLIST_EVENTS = new Set<string>([...WAITLIST_CONSTANTS.FREEING_EVENTS, ...WAITLIST_CONSTANTS.ACCEPTING_EVENTS]);

/** Offers times that bookings give back to the waitlist, and settles offers customers take up or let go. */
export const waitlistConsumer: OutboxConsumer = {
  name: "waitlist",
  handles: (type) => WAITLIST_EVENTS.has(type),
  handle: (message) => waitlistService.handleBookingEvent(message),
};

/** Every consumer the worker runs, in dispatch order. */
export const outboxConsumers: readonly OutboxConsumer[] = [
  availabilityCacheConsumer,
  bookingMetricsConsumer,
  knowledgeIndexConsumer,
  customerPreferencesConsumer,
  bookingNotificationsConsumer,
  calendarEventsConsumer,
  paymentsConsumer,
  waitlistConsumer,
];
