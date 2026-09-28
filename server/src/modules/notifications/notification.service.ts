import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { NOTIFICATION_CONSTANTS } from "../../constants/app.constants.js";
import { mailer, type Mailer } from "../../infrastructure/messaging/mailer.js";
import {
  smsSender,
  SmsProviderError,
  type SmsSender,
} from "../../infrastructure/messaging/sms-sender.js";
import { buildCalendarInvite } from "../../utils/ics.js";
import { toE164 } from "../../utils/phone.js";
import { parseStoredBusinessSettings } from "../businesses/business-settings.js";
import type { OutboxMessage } from "../outbox/dto/outbox.dto.js";
import { notificationDal } from "./dal/notification.dal.js";
import type {
  BookingNotificationContext,
  BookingNotificationContextRecord,
  NotificationChannel,
  NotificationKind,
  NotificationTemplateRecord,
  ReminderJobData,
} from "./dto/notification.dto.js";
import {
  DEFAULT_TEMPLATES,
  NOTIFICATION_CHANNELS,
  renderTemplate,
  type TemplateValues,
} from "./notification-templates.js";
import { planReminders } from "./reminder-plan.js";
import { QueueReminderScheduler, type ReminderScheduler } from "./reminder-scheduler.js";

const { EVENTS } = NOTIFICATION_CONSTANTS;

/** The address part of "Name <address>", or the whole value. */
function senderAddress(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

interface DeliveryOptions {
  kind: NotificationKind;
  /** Joined with the channel to make each message's dedupe key. */
  dedupeBase: string;
  calendar?: "REQUEST" | "CANCEL";
}

/**
 * Sends booking messages by email and SMS: right after a booking changes
 * (from outbox events) and as reminders (from delayed jobs). Every message is
 * recorded before it is sent, so a repeated event or job never sends twice.
 */
export class NotificationService {
  public constructor(
    private readonly scheduler: ReminderScheduler,
    private readonly email: Mailer = mailer,
    private readonly sms: SmsSender = smsSender,
  ) {}

  /** Reacts to a committed booking change. Safe to repeat for the same event. */
  public async handleBookingEvent(message: OutboxMessage, now: Date = new Date()): Promise<void> {
    const { bookingId, previousStatus } = message.payload;

    if (!message.businessId || typeof bookingId !== "string") return;

    const context = await this.loadContext(message.businessId, bookingId);

    if (!context) return;

    const dedupeBase = `event:${message.id}`;
    const eventStart = typeof message.payload.scheduledAt === "string" ? message.payload.scheduledAt : null;
    const stillCurrent = eventStart === context.scheduledAt.toISOString();

    switch (message.type) {
      case EVENTS.CONFIRMED:
        // A booking changed again before this ran; the later event sends its own message.
        if (context.status !== "CONFIRMED" || !stillCurrent) return;
        await this.deliver(context, { kind: "BOOKING_CONFIRMED", dedupeBase, calendar: "REQUEST" });
        await this.scheduleReminders(context, now);
        return;
      case EVENTS.REQUESTED:
        if (context.status !== "PENDING" || !stillCurrent) return;
        await this.deliver(context, { kind: "BOOKING_REQUESTED", dedupeBase });
        return;
      case EVENTS.RESCHEDULED:
        if (!stillCurrent || (context.status !== "CONFIRMED" && context.status !== "PENDING")) return;
        await this.deliver(context, {
          kind: "BOOKING_RESCHEDULED",
          dedupeBase,
          ...(context.status === "CONFIRMED" ? { calendar: "REQUEST" as const } : {}),
        });
        if (context.status === "CONFIRMED") await this.scheduleReminders(context, now);
        return;
      case EVENTS.CANCELLED:
        // Holds that were never confirmed or requested need no message.
        if (previousStatus !== "CONFIRMED" && previousStatus !== "PENDING") return;
        await this.scheduler.cancel(context, context.business.settings.reminderOffsetsMinutes);
        await this.deliver(context, {
          kind: "BOOKING_CANCELLED",
          dedupeBase,
          ...(previousStatus === "CONFIRMED" ? { calendar: "CANCEL" as const } : {}),
        });
        return;
      default:
        return;
    }
  }

  /** Runs a reminder job, unless the booking has moved, ended or lost that reminder. */
  public async sendReminder(job: ReminderJobData): Promise<void> {
    const context = await this.loadContext(job.businessId, job.bookingId);

    if (
      !context ||
      context.status !== "CONFIRMED" ||
      context.scheduledAt.toISOString() !== job.scheduledAt ||
      !context.business.settings.reminderOffsetsMinutes.includes(job.offsetMinutes)
    ) {
      return;
    }

    await this.deliver(context, {
      kind: "BOOKING_REMINDER",
      dedupeBase: `reminder:${job.bookingId}:${job.scheduledAt}:${job.offsetMinutes}`,
    });
  }

  /** Tells a waitlisted customer that a time is held for them and how long they have to confirm it. */
  public async sendWaitlistOffer(businessId: string, bookingId: string): Promise<void> {
    const context = await this.loadContext(businessId, bookingId);

    if (!context || context.status !== "HELD") return;

    await this.deliver(context, { kind: "WAITLIST_OFFER", dedupeBase: `waitlist:${bookingId}` });
  }

  /** Applies a Twilio delivery report to the message it describes. */
  public async recordSmsStatus(providerMessageId: string, status: string, errorCode?: string): Promise<void> {
    const mapped =
      status === "delivered"
        ? "DELIVERED"
        : status === "failed" || status === "undelivered"
          ? "FAILED"
          : status === "sent"
            ? "SENT"
            : null;

    if (!mapped) return;

    await notificationDal.recordDeliveryStatus(
      providerMessageId,
      mapped,
      mapped === "FAILED" ? `Twilio ${status}${errorCode ? ` (error ${errorCode})` : ""}` : null,
    );
  }

  private async scheduleReminders(context: BookingNotificationContext, now: Date): Promise<void> {
    const { settings } = context.business;
    const reminders = planReminders(
      context.scheduledAt,
      settings.reminderOffsetsMinutes,
      { start: settings.quietHoursStart, end: settings.quietHoursEnd },
      context.timeZone,
      now,
    );

    await this.scheduler.schedule(context, reminders, now);
  }

  /**
   * Sends one kind of message on every channel the customer can be reached
   * on. Temporary failures are rethrown after the other channels have been
   * tried, so the job is retried and only the unsent messages go out again.
   */
  private async deliver(context: BookingNotificationContext, options: DeliveryOptions): Promise<void> {
    const templates = await notificationDal.listTemplates(context.businessId);
    let retryable: unknown;

    for (const channel of NOTIFICATION_CHANNELS) {
      const recipient = channel === "EMAIL" ? context.customer.email : context.customer.phone;

      if (!recipient || (channel === "SMS" && !this.sms.isAvailable)) continue;

      const claim = await notificationDal.claim({
        businessId: context.businessId,
        bookingId: context.bookingId,
        customerId: context.customer.id,
        channel,
        kind: options.kind,
        recipient,
        dedupeKey: `${options.dedupeBase}:${channel}`,
        status: context.customer.optedOut.has(channel) ? "SKIPPED" : "PENDING",
      });

      if (!claim.send) continue;

      try {
        const providerMessageId = await this.send(channel, recipient, context, options, templates);

        await notificationDal.markSent(context.businessId, claim.id, providerMessageId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sending failed";

        await notificationDal.markFailed(
          context.businessId,
          claim.id,
          truncate(message, NOTIFICATION_CONSTANTS.MAX_ERROR_LENGTH),
        );
        logger.warn(
          { err: error, bookingId: context.bookingId, channel, kind: options.kind },
          "Notification failed",
        );

        // An SMS the provider refused outright (a bad number) won't succeed on a retry.
        if (!(error instanceof SmsProviderError && !error.retryable)) retryable ??= error;
      }
    }

    if (retryable) throw retryable;
  }

  private async send(
    channel: NotificationChannel,
    recipient: string,
    context: BookingNotificationContext,
    options: DeliveryOptions,
    templates: NotificationTemplateRecord[],
  ): Promise<string | null> {
    const custom = templates.find((template) => template.channel === channel && template.kind === options.kind);
    const template = custom ?? DEFAULT_TEMPLATES[channel][options.kind];
    const values = this.templateValues(context);
    const body = renderTemplate(template.body, values);

    if (channel === "SMS") {
      const receipt = await this.sms.send({
        to: recipient,
        text: truncate(body, NOTIFICATION_CONSTANTS.MAX_SMS_BODY_LENGTH),
        statusCallback: new URL(NOTIFICATION_CONSTANTS.TWILIO_STATUS_PATH, env.API_PUBLIC_URL).toString(),
      });

      return receipt?.providerMessageId ?? null;
    }

    await this.email.send({
      to: recipient,
      subject: renderTemplate(template.subject ?? DEFAULT_TEMPLATES.EMAIL[options.kind].subject ?? "", values),
      text: body,
      ...(options.calendar ? { calendarEvent: this.calendarInvite(context, options.calendar, recipient) } : {}),
    });

    return null;
  }

  private calendarInvite(
    context: BookingNotificationContext,
    method: "REQUEST" | "CANCEL",
    recipient: string,
  ): { method: "REQUEST" | "CANCEL"; content: string } {
    return {
      method,
      content: buildCalendarInvite({
        uid: `${context.bookingId}@${NOTIFICATION_CONSTANTS.ICS_UID_DOMAIN}`,
        // A cancellation must outrank the last update to the same event.
        sequence: context.rescheduleCount + (method === "CANCEL" ? 1 : 0),
        method,
        start: context.scheduledAt,
        end: context.endsAt,
        summary: `${context.serviceName} at ${context.business.name}`,
        description: `${context.serviceName}${context.staffName ? ` with ${context.staffName}` : ""}. Manage it: ${this.manageLink(context)}`,
        location: this.describeLocation(context),
        organizer: { name: context.business.name, email: senderAddress(env.MAIL_FROM) },
        attendee: { name: context.customer.name, email: recipient },
        now: new Date(),
      }),
    };
  }

  private templateValues(context: BookingNotificationContext): TemplateValues {
    const format = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en-US", { ...options, timeZone: context.timeZone }).format(context.scheduledAt);

    return {
      customerName: context.customer.name.trim().split(/\s+/)[0] ?? context.customer.name,
      businessName: context.business.name,
      serviceName: context.serviceName,
      staffName: context.staffName ?? "our team",
      date: format({ weekday: "short", month: "short", day: "numeric" }),
      time: format({ hour: "numeric", minute: "2-digit" }),
      timeZone: context.timeZone,
      location: this.describeLocation(context),
      link: this.manageLink(context),
      heldUntil: context.holdExpiresAt
        ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: context.timeZone }).format(
            context.holdExpiresAt,
          )
        : "",
    };
  }

  private describeLocation(context: BookingNotificationContext): string {
    const location = context.location;

    if (!location) return context.business.name;

    return location.address ? `${location.name}, ${location.address}` : location.name;
  }

  private manageLink(context: BookingNotificationContext): string {
    return new URL(`/appointments/${context.bookingId}`, env.WEB_ORIGIN).toString();
  }

  private async loadContext(businessId: string, bookingId: string): Promise<BookingNotificationContext | null> {
    const record = await notificationDal.findBookingContext(businessId, bookingId);

    return record ? this.toContext(record) : null;
  }

  private toContext(record: BookingNotificationContextRecord): BookingNotificationContext {
    const { customer } = record;
    const verifiedPhone = customer.user?.phoneVerifiedAt ? customer.user.phone : null;

    return {
      bookingId: record.id,
      businessId: record.businessId,
      status: record.status,
      scheduledAt: record.scheduledAt,
      endsAt: record.endsAt,
      timeZone: record.timeZone,
      serviceName: record.serviceName,
      rescheduleCount: record.rescheduleCount,
      holdExpiresAt: record.holdExpiresAt,
      staffName: record.staff?.displayName ?? null,
      location: record.service?.location ?? record.business.locations[0] ?? null,
      business: {
        name: record.business.name,
        slug: record.business.slug,
        settings: parseStoredBusinessSettings(record.business.settings),
      },
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email ?? customer.user?.email ?? null,
        phone: toE164(verifiedPhone) ?? toE164(customer.phone),
        optedOut: new Set(
          customer.notificationPreferences.filter((preference) => !preference.optedIn).map((preference) => preference.channel),
        ),
      },
    };
  }
}

export const reminderScheduler = new QueueReminderScheduler();

export const notificationService = new NotificationService(reminderScheduler);
