import {
  AGENT_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_PATTERNS,
} from "../../../constants/app.constants.js";
import type { AgentToolResult } from "../../../integrations/ai/agent/agent.dto.js";
import { AppError } from "../../../middleware/app-error.js";
import { formatMinorAmount } from "../../../utils/money.js";
import { createSlotToken, readSlotToken } from "../../../utils/slot-token.js";
import {
  addDaysToLocalDate,
  getLocalDateTimeValues,
  localTimeToMinutes,
} from "../../../utils/time-zone.js";
import { availabilityService } from "../../availability/availability.service.js";
import { bookingService } from "../../bookings/booking.service.js";
import type { AppointmentResponse, BookingRecord } from "../../bookings/dto/booking.dto.js";
import { catalogService } from "../../catalog/catalog.service.js";
import { customerProfileService } from "../../customers/customer-profile.service.js";
import type { CustomerPreferenceKey } from "../../customers/dto/customer-profile.dto.js";
import { knowledgeService } from "../../knowledge/knowledge.service.js";
import type { PublicServiceResponse } from "../../catalog/dto/catalog.dto.js";
import { staffService } from "../../staff/staff.service.js";
import type { WaitlistEntryResponse } from "../../waitlist/dto/waitlist.dto.js";
import { reviewService } from "../../reviews/review.service.js";
import { waitlistService } from "../../waitlist/waitlist.service.js";
import { chatService } from "../chat.service.js";
import type {
  ChatAction,
  ChatBookingSummary,
  ChatMessagePart,
  ChatSlotOption,
  JoinWaitlistAction,
} from "../dto/chat.dto.js";

/** Who and where a turn runs for; tools only ever act inside this. */
export interface AssistantContext {
  userId: string;
  sessionId: string;
  business: { id: string; name: string; slug: string };
  /** The customer's time zone, for showing and reading times. */
  timeZone: string;
  now: Date;
  /** The chat's current hold; it doesn't block the customer's own new choice. */
  draftHoldId?: string | undefined;
}

export type PartOfDay = keyof typeof AGENT_CONSTANTS.PART_OF_DAY;

/** The preference kinds the agent's tools name, and what each is stored as. */
export const PREFERENCE_KINDS = ["provider", "service", "part_of_day"] as const;

export type PreferenceKind = (typeof PREFERENCE_KINDS)[number];

const PREFERENCE_KEYS: Record<PreferenceKind, CustomerPreferenceKey> = {
  provider: "PREFERRED_STAFF",
  service: "USUAL_SERVICE",
  part_of_day: "PREFERRED_PART_OF_DAY",
};

type Result = AgentToolResult<ChatMessagePart>;

export class AssistantActionError extends AppError {
  public constructor(code: string, message: string) {
    super(409, code, message);
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isUnavailableSlotError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.code === ERROR_CODES.APPOINTMENT_SLOT_UNAVAILABLE ||
      error.code === ERROR_CODES.CLASS_FULL ||
      (error.statusCode === 422 && Boolean(error.fieldErrors?.startsAt)))
  );
}

/**
 * Everything the booking assistant can look up or propose. The AI agent
 * reaches these through tools; taps on cards reach them directly. Nothing
 * here books, cancels or moves a booking without the customer's tap.
 */
export class BookingAssistantService {
  public async searchServices(context: AssistantContext, query?: string): Promise<Result> {
    const search = query?.trim();
    const matches = search
      ? (await catalogService.listPublicServices(context.business.slug, search)).items
      : [];
    const services = (matches.length > 0
      ? matches
      : (await catalogService.listPublicServices(context.business.slug)).items
    ).slice(0, AGENT_CONSTANTS.MAX_SERVICE_RESULTS);

    return {
      data: {
        ...(search && matches.length === 0 ? { note: `Nothing matched "${search}"; these are the services offered.` } : {}),
        services: services.map((service) => ({
          serviceId: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          price: formatMinorAmount(service.priceMinor, service.currency),
          ...(service.description ? { description: service.description } : {}),
          ...(service.bookingType === "CLASS" ? { kind: "class", capacity: service.capacity } : {}),
        })),
      },
      parts:
        services.length > 0
          ? [{ type: "service_cards", services: services.map((service) => this.toServiceCard(service)) }]
          : [],
    };
  }

  public async listStaff(context: AssistantContext, serviceId: string): Promise<Result> {
    const service = await this.requireService(context, serviceId);
    const staff = (await staffService.listPublicStaff(context.business.slug, service.id)).items;
    const today = this.today(context);
    const withNextDay = await Promise.all(
      staff.slice(0, AGENT_CONSTANTS.MAX_SERVICE_RESULTS).map(async (member) => {
        const availability = await availabilityService.getPublicAvailability(context.business.slug, {
          serviceId: service.id,
          staffId: member.id,
          from: today,
          to: addDaysToLocalDate(today, AGENT_CONSTANTS.STAFF_LOOKAHEAD_DAYS - 1),
          timeZone: context.timeZone,
        });

        return {
          staffId: member.id,
          name: member.displayName,
          ...(member.bio ? { bio: member.bio } : {}),
          nextFreeDate: availability.days.find((day) => day.slots.length > 0)?.date ?? null,
        };
      }),
    );

    return { data: { service: service.name, staff: withNextDay } };
  }

  public async getAvailability(
    context: AssistantContext,
    input: {
      serviceId: string;
      staffId?: string | undefined;
      date: string;
      days?: number | undefined;
      partOfDay?: PartOfDay | undefined;
      /** A specific local time the customer asked for, HH:mm. */
      time?: string | undefined;
      rescheduleBookingId?: string | undefined;
    },
  ): Promise<Result> {
    const service = await this.requireService(context, input.serviceId);
    let staffId = input.staffId;

    if (input.rescheduleBookingId) {
      // A booking keeps its provider when it moves.
      const booking = await this.requireOwnBooking(context, input.rescheduleBookingId);

      staffId = booking.staff?.id ?? staffId;
    }

    if (!DATE_PATTERN.test(input.date)) {
      throw new AppError(422, ERROR_CODES.REQUEST_VALIDATION_FAILED, "date must be YYYY-MM-DD");
    }

    const from = input.date < this.today(context) ? this.today(context) : input.date;
    const days = Math.min(Math.max(input.days ?? 1, 1), AGENT_CONSTANTS.MAX_AVAILABILITY_DAYS);
    const exclude = input.rescheduleBookingId ?? context.draftHoldId;
    const slots = await this.findSlots(context, service, staffId, from, days, input.partOfDay, exclude);

    if (slots.length === 0) {
      const next = await this.findSlots(
        context,
        service,
        staffId,
        addDaysToLocalDate(from, days),
        AGENT_CONSTANTS.STAFF_LOOKAHEAD_DAYS,
        input.partOfDay,
        exclude,
      );

      const waitlist = this.waitlistButton({
        serviceId: service.id,
        fromDate: from,
        toDate: addDaysToLocalDate(from, days - 1),
        ...(staffId ? { staffId } : {}),
        ...(input.partOfDay ? { partOfDay: input.partOfDay } : {}),
      });

      return {
        data: {
          service: service.name,
          slots: [],
          nextAvailable: next[0] ? this.describeSlot(next[0], context.timeZone) : null,
          // Rescheduling moves an existing booking, which the waitlist does not do.
          ...(input.rescheduleBookingId
            ? {}
            : { waitlist: "The customer can join the waitlist for these dates (join_waitlist, or the button shown)." }),
        },
        ...(input.rescheduleBookingId ? {} : { parts: [waitlist] }),
      };
    }

    const requestedMinute = input.time ? localTimeToMinutes(input.time) : null;
    const minuteOf = (slot: ChatSlotOption) =>
      localTimeToMinutes(this.describeInstant(new Date(slot.startsAt), context.timeZone).time) ?? 0;
    // With a requested time, show the exact slot (if open) and its nearest neighbours.
    const shown = (
      requestedMinute === null
        ? slots.slice(0, AGENT_CONSTANTS.MAX_SLOTS_SHOWN)
        : [...slots]
            .sort((a, b) => Math.abs(minuteOf(a) - requestedMinute) - Math.abs(minuteOf(b) - requestedMinute))
            .slice(0, AGENT_CONSTANTS.MAX_SLOTS_SHOWN)
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    );
    const exact =
      requestedMinute === null
        ? undefined
        : shown.find(
            (slot) =>
              minuteOf(slot) === requestedMinute &&
              this.describeInstant(new Date(slot.startsAt), context.timeZone).date === from,
          );

    return {
      data: {
        service: service.name,
        timeZone: context.timeZone,
        ...(input.time
          ? {
              requested: exact
                ? { available: true, slotToken: exact.token, ...this.describeSlot(exact, context.timeZone) }
                : { available: false, time: input.time },
            }
          : {}),
        slots: shown.map((slot) => ({ slotToken: slot.token, ...this.describeSlot(slot, context.timeZone) })),
        ...(slots.length > shown.length ? { moreAvailable: slots.length - shown.length } : {}),
      },
      parts: [
        {
          type: "slot_picker",
          serviceId: service.id,
          serviceName: service.name,
          timeZone: context.timeZone,
          slots: shown,
          ...(input.rescheduleBookingId ? { rescheduleBookingId: input.rescheduleBookingId } : {}),
        },
      ],
    };
  }

  /** Holds an offered slot for the customer and asks them to confirm it. */
  public async proposeBooking(
    context: AssistantContext,
    input: { slotToken: string; notes?: string | undefined },
  ): Promise<Result> {
    const slot = this.readToken(context, input.slotToken);
    const service = await this.requireService(context, slot.serviceId);
    const session = await chatService.getSession(context.userId, context.sessionId);
    const current = session.draft.hold;

    if (
      current &&
      current.serviceName === service.name &&
      new Date(current.startsAt).getTime() === slot.startsAt.getTime()
    ) {
      return this.holdResult(current);
    }

    // Let go of the old hold first so it can't block the customer's new choice.
    const previous = current ? await bookingService.findHeldForUser(context.userId, current.bookingId) : null;

    if (previous) await bookingService.releaseHold(previous, { type: "CUSTOMER", userId: context.userId });

    let hold: BookingRecord;

    try {
      hold = await bookingService.holdForUser({
        businessId: context.business.id,
        serviceId: service.id,
        startsAt: slot.startsAt,
        userId: context.userId,
        chatSessionId: null,
        notes: input.notes?.trim() || null,
        source: "CHAT",
        ...(slot.staffId ? { staffId: slot.staffId } : {}),
      });
    } catch (error) {
      if (previous) await this.restoreHold(context, previous);
      if (!isUnavailableSlotError(error)) throw error;

      throw new AssistantActionError(
        ERROR_CODES.APPOINTMENT_SLOT_UNAVAILABLE,
        "That time was just taken. Check availability again and offer other times.",
      );
    }

    context.draftHoldId = hold.id;
    await chatService.updateDraft(context.userId, context.sessionId, {
      serviceId: service.id,
      staffId: hold.staff?.id ?? null,
      holdId: hold.id,
      timeZone: context.timeZone,
      notes: hold.notes,
    });

    return this.holdResult(this.toSummary(hold, context.timeZone));
  }

  public async listMyBookings(context: AssistantContext): Promise<Result> {
    const bookings = await bookingService.listUpcomingForCustomerAt(
      context.userId,
      context.business.id,
      AGENT_CONSTANTS.MAX_BOOKINGS_LISTED,
    );
    const summaries = bookings.map((booking) => this.appointmentSummary(booking, context.timeZone));

    return {
      data: {
        bookings: bookings.map((booking) => ({
          bookingId: booking.id,
          service: booking.serviceName,
          serviceId: booking.serviceId,
          ...this.describeInstant(booking.scheduledAt, context.timeZone),
          staff: booking.staff?.name ?? null,
          status: booking.status,
          canCancel: booking.canCancel,
          canReschedule: booking.canReschedule,
        })),
      },
      parts: summaries.length > 0 ? [{ type: "booking_list", bookings: summaries }] : [],
    };
  }

  public async proposeCancel(context: AssistantContext, bookingId: string): Promise<Result> {
    const booking = await this.requireOwnBooking(context, bookingId);

    if (!booking.canCancel) {
      return { data: { error: ERROR_MESSAGES.APPOINTMENT_CANCELLATION_NOT_ALLOWED } };
    }

    const summary = this.appointmentSummary(booking, context.timeZone);

    return {
      data: { proposed: "cancel", booking: summary, next: "Ask the customer to press Cancel booking to confirm." },
      parts: [
        { type: "booking_summary", booking: summary },
        {
          type: "confirm",
          label: "Cancel booking",
          description: `Cancel ${summary.serviceName} on ${this.describeInstant(booking.scheduledAt, context.timeZone).label}?`,
          tone: "danger",
          action: { type: "cancel_booking", bookingId: booking.id },
        },
      ],
    };
  }

  public async proposeReschedule(
    context: AssistantContext,
    input: { bookingId: string; slotToken: string },
  ): Promise<Result> {
    const booking = await this.requireOwnBooking(context, input.bookingId);
    const slot = this.readToken(context, input.slotToken);

    if (!booking.canReschedule) {
      return { data: { error: ERROR_MESSAGES.APPOINTMENT_RESCHEDULE_NOT_ALLOWED } };
    }

    if (slot.serviceId !== booking.serviceId) {
      return { data: { error: "That time is for a different service. Get availability for this booking's service." } };
    }

    const summary = this.appointmentSummary(booking, context.timeZone);
    const target = this.describeInstant(slot.startsAt, context.timeZone).label;

    return {
      data: { proposed: "reschedule", booking: summary, newTime: target, next: "Ask the customer to press the button to move it." },
      parts: [
        { type: "booking_summary", booking: summary },
        {
          type: "confirm",
          label: "Move booking",
          description: `Move ${summary.serviceName} to ${target}?`,
          tone: "primary",
          action: { type: "reschedule_booking", bookingId: booking.id, slotToken: input.slotToken },
        },
      ],
    };
  }

  /** Passages from the business's FAQs and policies; the reply must come from these. */
  public async searchKnowledge(context: AssistantContext, query: string): Promise<Result> {
    const { results } = await knowledgeService.search(context.business.id, query);

    if (results.length === 0) {
      return {
        data: {
          results: [],
          next: `Nothing in ${context.business.name}'s information covers this. Say you don't know and offer to pass the question to the team.`,
        },
      };
    }

    return {
      data: {
        results: results.map((result) => ({ source: result.sourceTitle, kind: result.kind, text: result.content })),
        next: "Answer only from these passages and mention the source title. If they don't answer the question, say you don't know.",
      },
    };
  }

  /** What customers said in the reviews the business published. */
  public async getReviews(context: AssistantContext): Promise<Result> {
    const reviews = await reviewService.listPublished(context.business.id, 5);

    if (reviews.count === 0) {
      return { data: { count: 0, next: `${context.business.name} has no published reviews yet. Say so plainly.` } };
    }

    return {
      data: {
        average: reviews.average,
        count: reviews.count,
        latest: reviews.items.map((review) => ({
          rating: review.rating,
          service: review.serviceName,
          comment: review.comment,
          reply: review.reply,
        })),
        next: "Summarize honestly from these reviews only, with the average and count. Don't invent quotes.",
      },
    };
  }

  /** Saves a preference the customer stated; the value must name something real. */
  public async rememberPreference(
    context: AssistantContext,
    input: { preference: PreferenceKind; value: string },
  ): Promise<Result> {
    const saved = await customerProfileService.rememberPreference(
      context.business.id,
      context.userId,
      PREFERENCE_KEYS[input.preference],
      input.value.trim().toLowerCase(),
    );

    return {
      data: {
        saved: { preference: input.preference, value: saved.label },
        next: "Tell the customer briefly that you'll remember this for their next bookings here.",
      },
    };
  }

  public async forgetPreference(context: AssistantContext, preference: PreferenceKind): Promise<Result> {
    const forgotten = await customerProfileService.forgetPreference(
      context.business.id,
      context.userId,
      PREFERENCE_KEYS[preference],
    );

    return {
      data: forgotten
        ? { forgotten: preference, next: "Tell the customer it's forgotten." }
        : { forgotten: null, next: "Nothing was saved for that. Tell the customer so." },
    };
  }

  public async handoffToHuman(context: AssistantContext, reason: string): Promise<Result> {
    await chatService.requestHandoff(context.userId, context.sessionId, reason.trim().slice(0, 500) || null);

    return { data: { ok: true, next: `Tell the customer that someone from ${context.business.name} will follow up.` } };
  }

  /**
   * A tap on a card or button: deterministic, no AI. Returns the reply text
   * and parts for the new assistant message.
   */
  public async handleAction(
    context: AssistantContext,
    action: ChatAction,
  ): Promise<{ content: string; parts: ChatMessagePart[] }> {
    switch (action.type) {
      case "select_service": {
        const lookup = (staffId?: string) =>
          this.getAvailability(context, {
            serviceId: action.serviceId,
            date: this.today(context),
            days: AGENT_CONSTANTS.MAX_AVAILABILITY_DAYS,
            ...(staffId ? { staffId } : {}),
          });
        type AvailabilityData = { service: string; slots: unknown[]; nextAvailable?: { label: string } | null };
        let result = await lookup(action.staffId);
        let data = result.data as AvailabilityData;
        // A usual provider with nothing open this week shouldn't hide everyone else's times.
        const withStaff = Boolean(action.staffId) && data.slots.length > 0;

        if (action.staffId && !withStaff) {
          result = await lookup();
          data = result.data as AvailabilityData;
        }

        await chatService.updateDraft(context.userId, context.sessionId, {
          serviceId: action.serviceId,
          ...(withStaff && action.staffId ? { staffId: action.staffId } : {}),
        });

        const staffName = withStaff ? this.firstStaffName(result.parts) : null;

        return {
          content:
            data.slots.length > 0
              ? `Here are the next open times for ${data.service}${staffName ? ` with ${staffName}` : ""}. Pick one to hold it.`
              : data.nextAvailable
                ? `${data.service} is fully booked this week. The next opening is ${data.nextAvailable.label}.`
                : `${data.service} has no open times in the next few weeks.`,
          parts: result.parts ?? [],
        };
      }
      case "select_slot": {
        const result = await this.proposeBooking(context, { slotToken: action.slotToken });
        const hold = (result.parts?.[0] as { booking: ChatBookingSummary } | undefined)?.booking;

        return {
          content: hold ? this.holdMessage(hold) : "That time is held for you. Please confirm to book it.",
          parts: result.parts ?? [],
        };
      }
      case "cancel_booking": {
        await this.requireOwnBooking(context, action.bookingId);
        const cancelled = await bookingService.cancelForCustomer(context.userId, action.bookingId, "Cancelled in chat");
        const summary = this.appointmentSummary(cancelled, context.timeZone);

        return {
          content: `Done — your ${summary.serviceName} on ${this.describeInstant(cancelled.scheduledAt, context.timeZone).label} is cancelled.`,
          parts: [{ type: "booking_summary", booking: summary }],
        };
      }
      case "reschedule_booking": {
        await this.requireOwnBooking(context, action.bookingId);
        const slot = this.readToken(context, action.slotToken);
        const moved = await bookingService.rescheduleForCustomerAt(context.userId, action.bookingId, slot.startsAt);
        const summary = this.appointmentSummary(moved, context.timeZone);

        return {
          content: `Done — your ${summary.serviceName} is now on ${this.describeInstant(moved.scheduledAt, context.timeZone).label}.`,
          parts: [{ type: "booking_summary", booking: summary }],
        };
      }
      case "confirm_booking":
        throw new AppError(422, ERROR_CODES.REQUEST_VALIDATION_FAILED, "Confirm a held booking with the confirm endpoint");
      case "join_waitlist": {
        const entry = await waitlistService.joinAt(context.userId, context.business, {
          ...action,
          timeZone: context.timeZone,
        });

        return { content: this.waitlistMessage(entry), parts: [] };
      }
    }
  }

  /** Puts the customer on the waitlist when no open time suits them. */
  public async joinWaitlist(
    context: AssistantContext,
    input: {
      serviceId: string;
      fromDate: string;
      toDate?: string | undefined;
      staffId?: string | undefined;
      partOfDay?: PartOfDay | undefined;
    },
  ): Promise<Result> {
    const entry = await waitlistService.joinAt(context.userId, context.business, {
      serviceId: input.serviceId,
      fromDate: input.fromDate,
      toDate: input.toDate ?? addDaysToLocalDate(input.fromDate, AGENT_CONSTANTS.MAX_AVAILABILITY_DAYS - 1),
      staffId: input.staffId,
      partOfDay: input.partOfDay,
      timeZone: context.timeZone,
    });

    return {
      data: {
        joined: { service: entry.service.name, from: entry.fromDate, to: entry.toDate, partOfDay: entry.partOfDay },
        next: "Tell the customer they are on the waitlist and will get a message with 15 minutes to confirm if a time opens up.",
      },
    };
  }

  private waitlistButton(action: Omit<JoinWaitlistAction, "type">): ChatMessagePart {
    return {
      type: "confirm",
      label: "Join the waitlist",
      description: "We'll hold the first time that opens up and let you know.",
      tone: "primary",
      action: { type: "join_waitlist", ...action },
    };
  }

  private waitlistMessage(entry: WaitlistEntryResponse): string {
    const day = (date: string) =>
      new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
        new Date(`${date}T12:00:00Z`),
      );
    const range = entry.fromDate === entry.toDate ? day(entry.fromDate) : `${day(entry.fromDate)} to ${day(entry.toDate)}`;

    return `You're on the waitlist for ${entry.service.name}${entry.staff ? ` with ${entry.staff.name}` : ""}, ${range}${entry.partOfDay ? ` (${entry.partOfDay}s)` : ""}. If a time opens up, I'll hold it for you for 15 minutes and send you a link to confirm.`;
  }

  /** Open times near a slot that could not be held, as a picker. */
  public async offerAlternatives(
    context: AssistantContext,
    serviceId: string,
    staffId: string | undefined,
    fromDate: string,
  ): Promise<{ content: string; parts: ChatMessagePart[] }> {
    const service = await this.requireService(context, serviceId);
    const slots = (
      await this.findSlots(context, service, staffId, fromDate, AGENT_CONSTANTS.MAX_AVAILABILITY_DAYS)
    ).slice(0, AGENT_CONSTANTS.MAX_SLOTS_SHOWN);

    return slots.length > 0
      ? {
          content: "That time isn't available any more. Here are the closest open times.",
          parts: [{ type: "slot_picker", serviceId: service.id, serviceName: service.name, timeZone: context.timeZone, slots }],
        }
      : {
          content: "There are no open times for that service in the next few weeks. Please try another service.",
          parts: [],
        };
  }

  /** The service and provider an offered slot was for, if the token is still genuine. */
  public peekToken(context: AssistantContext, token: string) {
    return readSlotToken(token, context.business.id, context.now);
  }

  /** Signed options for a service's open times, earliest first. */
  public async findSlots(
    context: AssistantContext,
    service: { id: string },
    staffId: string | undefined,
    fromDate: string,
    days: number,
    partOfDay?: PartOfDay,
    excludeBookingId?: string,
  ): Promise<ChatSlotOption[]> {
    const [availability, staff] = await Promise.all([
      availabilityService.getPublicAvailability(
        context.business.slug,
        {
          serviceId: service.id,
          from: fromDate,
          to: addDaysToLocalDate(fromDate, days - 1),
          timeZone: context.timeZone,
          ...(staffId ? { staffId } : {}),
        },
        excludeBookingId ? { excludeBookingId } : {},
      ),
      staffService.listPublicStaff(context.business.slug, service.id),
    ]);
    const names = new Map(staff.items.map((member) => [member.id, member.displayName]));
    const window = partOfDay ? AGENT_CONSTANTS.PART_OF_DAY[partOfDay] : null;

    return availability.days.flatMap((day) =>
      day.slots
        .filter((slot) => {
          const minute = localTimeToMinutes(slot.time) ?? 0;

          return !window || (minute >= window.fromMinute && minute < window.toMinute);
        })
        .map((slot) => {
          const onlyStaff = staffId ?? (slot.staffIds.length === 1 ? slot.staffIds[0] : undefined);

          return {
            token: createSlotToken(
              {
                businessId: context.business.id,
                serviceId: service.id,
                staffId: onlyStaff ?? null,
                startsAt: new Date(slot.startsAt),
              },
              context.now,
            ),
            startsAt: new Date(slot.startsAt).toISOString(),
            endsAt: new Date(slot.endsAt).toISOString(),
            staffName: onlyStaff ? (names.get(onlyStaff) ?? null) : null,
            seatsLeft: slot.seatsLeft,
          };
        }),
    );
  }

  public holdMessage(hold: ChatBookingSummary): string {
    const when = this.describeInstant(new Date(hold.startsAt), hold.timeZone).label;
    const until = hold.holdExpiresAt
      ? ` I'm holding it until ${new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: hold.timeZone }).format(new Date(hold.holdExpiresAt))}.`
      : "";

    return `${hold.serviceName}${hold.staffName ? ` with ${hold.staffName}` : ""} on ${when} is available.${until} Press Confirm booking to book it.`;
  }

  public toSummary(booking: BookingRecord, timeZone: string): ChatBookingSummary {
    return {
      bookingId: booking.id,
      serviceName: booking.serviceName,
      staffName: booking.staff?.displayName ?? null,
      startsAt: booking.scheduledAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      durationMinutes: booking.durationMinutes,
      priceMinor: booking.priceMinor,
      currency: booking.currency,
      status: booking.status,
      holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
      timeZone,
    };
  }

  public describeInstant(value: Date, timeZone: string): { date: string; time: string; label: string } {
    const local = getLocalDateTimeValues(value, timeZone);
    const label = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(value);

    return { date: local?.date ?? "", time: local?.time ?? "", label };
  }

  public today(context: AssistantContext): string {
    return getLocalDateTimeValues(context.now, context.timeZone)?.date ?? context.now.toISOString().slice(0, 10);
  }

  private holdResult(hold: ChatBookingSummary): Result {
    return {
      data: {
        held: { ...hold, when: this.describeInstant(new Date(hold.startsAt), hold.timeZone).label },
        next: "The slot is held. Ask the customer to press Confirm booking; do not say it is booked.",
      },
      parts: [
        { type: "booking_summary", booking: hold },
        {
          type: "confirm",
          label: "Confirm booking",
          description: "Book this time.",
          tone: "primary",
          action: { type: "confirm_booking" },
        },
      ],
    };
  }

  private firstStaffName(parts: ChatMessagePart[] | undefined): string | null {
    const picker = parts?.find((part) => part.type === "slot_picker");

    return picker?.type === "slot_picker" ? (picker.slots[0]?.staffName ?? null) : null;
  }

  private describeSlot(slot: ChatSlotOption, timeZone: string) {
    const { date, time, label } = this.describeInstant(new Date(slot.startsAt), timeZone);

    return { date, time, label, ...(slot.staffName ? { staff: slot.staffName } : {}) };
  }

  private appointmentSummary(booking: AppointmentResponse, timeZone: string): ChatBookingSummary {
    return {
      bookingId: booking.id,
      serviceName: booking.serviceName,
      staffName: booking.staff?.name ?? null,
      startsAt: booking.scheduledAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      durationMinutes: booking.durationMinutes,
      priceMinor: booking.priceMinor,
      currency: booking.currency,
      status: booking.status,
      holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
      timeZone,
    };
  }

  private toServiceCard(service: PublicServiceResponse) {
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      durationMinutes: service.durationMinutes,
      priceMinor: service.priceMinor,
      currency: service.currency,
    };
  }

  private readToken(context: AssistantContext, token: string) {
    const slot = readSlotToken(token, context.business.id, context.now);

    if (!slot) {
      throw new AssistantActionError(
        ERROR_CODES.APPOINTMENT_SLOT_UNAVAILABLE,
        "That time is no longer on offer. Get availability again and use one of the new slot tokens.",
      );
    }

    return slot;
  }

  private async requireService(context: AssistantContext, serviceId: string) {
    const service = VALIDATION_PATTERNS.UUID.test(serviceId)
      ? await catalogService.findBookableService(context.business.id, serviceId)
      : null;

    if (!service) {
      throw new AppError(404, ERROR_CODES.SERVICE_NOT_FOUND, "No such service. Use search_services to find the serviceId.");
    }

    return service;
  }

  /** The customer's own booking at this business; anything else looks like it does not exist. */
  private async requireOwnBooking(context: AssistantContext, bookingId: string): Promise<AppointmentResponse> {
    const booking = VALIDATION_PATTERNS.UUID.test(bookingId)
      ? await bookingService.getForCustomer(context.userId, bookingId).catch(() => null)
      : null;

    if (!booking || booking.business.id !== context.business.id) {
      throw new AppError(404, ERROR_CODES.APPOINTMENT_NOT_FOUND, ERROR_MESSAGES.APPOINTMENT_NOT_FOUND);
    }

    return booking;
  }

  /** Best effort: put back a hold released for a new choice that then failed. */
  private async restoreHold(context: AssistantContext, previous: BookingRecord): Promise<void> {
    try {
      const restored = await bookingService.holdForUser({
        businessId: context.business.id,
        serviceId: previous.serviceId ?? "",
        startsAt: previous.scheduledAt,
        userId: context.userId,
        chatSessionId: null,
        notes: previous.notes,
        source: "CHAT",
        ...(previous.staffId ? { staffId: previous.staffId } : {}),
      });

      context.draftHoldId = restored.id;
      await chatService.updateDraft(context.userId, context.sessionId, { holdId: restored.id });
    } catch {
      await chatService.updateDraft(context.userId, context.sessionId, { holdId: null });
    }
  }
}

export const bookingAssistantService = new BookingAssistantService();
