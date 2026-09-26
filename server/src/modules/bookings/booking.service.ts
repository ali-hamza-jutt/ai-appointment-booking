import { randomUUID } from "node:crypto";

import {
  BOOKING_CONSTANTS,
  BUSINESS_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  OBSERVABILITY_CONSTANTS,
  VALIDATION_MESSAGES,
} from "../../constants/app.constants.js";
import {
  prisma,
  type TransactionClient,
} from "../../infrastructure/database/prisma.js";
import { bookingMetrics } from "../../infrastructure/observability/metrics.js";
import { withSpan } from "../../infrastructure/observability/tracing.js";
import { AppError } from "../../middleware/app-error.js";
import { isExclusionViolationError } from "../../utils/database.js";
import { assertUuid } from "../../utils/identifiers.js";
import {
  decodeTimestampCursor,
  encodeTimestampCursor,
} from "../../utils/pagination.js";
import { normalizeEmail, normalizeWhitespace } from "../../utils/text.js";
import { localDateTimeToUtc } from "../../utils/time-zone.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { availabilityService } from "../availability/availability.service.js";
import { availabilityDal } from "../availability/dal/availability.dal.js";
import type { AvailabilityServiceRecord } from "../availability/dto/availability.dto.js";
import { businessService } from "../businesses/business.service.js";
import { businessDal } from "../businesses/dal/business.dal.js";
import { customerService } from "../customers/customer.service.js";
import { resolveBookingPolicy } from "./booking-policy.js";
import { BookingSlotConflictError } from "./booking-slot-conflict.error.js";
import { bookingDal, BookingTransitionError } from "./dal/booking.dal.js";
import type {
  AppointmentListResponse,
  AppointmentResponse,
  BookingActor,
  BookingEventListResponse,
  BookingEventType,
  BookingListResponse,
  BookingRecord,
  BookingStatus,
  BookingResponse,
  CreateHoldRequest,
  CreateStaffBookingRequest,
  ListAppointmentsOptions,
  ListBookingsOptions,
  PlaceBookingInput,
  RescheduleAppointmentRequest,
  StaffRescheduleRequest,
} from "./dto/booking.dto.js";

const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_SECOND = 1_000;

const ATTEMPT_OUTCOME_BY_STATUS: Partial<Record<BookingStatus, "held" | "confirmed" | "pending">> = {
  HELD: "held",
  CONFIRMED: "confirmed",
  PENDING: "pending",
};
const MILLISECONDS_PER_HOUR = 3_600_000;
const MILLISECONDS_PER_DAY = 86_400_000;

export class BookingService {
  // ---------------------------------------------------------------------------
  // Placement

  /**
   * Places a booking on a provider's schedule. Inside one transaction it locks
   * the provider (and any required resources), expires the provider's lapsed
   * holds, recomputes the slot from the database and inserts the booking. The
   * exclusion constraint is the final guard. With no staff chosen, each
   * provider who owns the slot is tried in turn.
   */
  public placeBooking(input: PlaceBookingInput): Promise<BookingRecord> {
    const labels = { source: input.source, mode: input.mode };

    return withSpan(
      "booking.place",
      {
        [OBSERVABILITY_CONSTANTS.BUSINESS_ID_ATTRIBUTE]: input.businessId,
        "booking.source": input.source,
        "booking.mode": input.mode,
      },
      async (span) => {
        try {
          const booking = await this.placeBookingOnSchedule(input);

          span.setAttribute("booking.id", booking.id);
          bookingMetrics.attempt(ATTEMPT_OUTCOME_BY_STATUS[booking.status] ?? "confirmed", labels);

          return booking;
        } catch (error) {
          bookingMetrics.attempt(this.attemptOutcomeFor(error), labels);
          throw error;
        }
      },
    );
  }

  private attemptOutcomeFor(error: unknown): "conflict" | "rejected" | "error" {
    if (!(error instanceof AppError)) return "error";
    if (error.code === ERROR_CODES.APPOINTMENT_SLOT_UNAVAILABLE) return "conflict";

    return error.statusCode < 500 ? "rejected" : "error";
  }

  private async placeBookingOnSchedule(input: PlaceBookingInput): Promise<BookingRecord> {
    const [business, service] = await Promise.all([
      businessDal.findBusinessById(input.businessId),
      availabilityDal.findBookableService(input.businessId, input.serviceId),
    ]);

    if (!business) this.throwBusinessNotFound();
    if (!service || (input.mode === "CUSTOMER" && !service.onlineBookable)) {
      this.throwServiceNotFound();
    }

    if (Number.isNaN(input.startsAt.getTime()) || input.startsAt.getTime() <= Date.now()) {
      throwRequestValidationError("startsAt", VALIDATION_MESSAGES.BOOKING_START);
    }

    const preview = await availabilityService.findSlot({
      client: prisma,
      business,
      service,
      startsAt: input.startsAt,
      mode: input.mode,
      ...(input.staffId ? { staffId: input.staffId } : {}),
    });

    if (!preview) this.throwSlotUnavailable();

    const candidates = input.staffId ? [input.staffId] : preview.staffIds;

    for (const [index, staffId] of candidates.entries()) {
      try {
        return await prisma.$transaction((transaction) =>
          this.placeOnStaff(transaction, input, business, service, staffId),
        );
      } catch (error) {
        const isConflict =
          error instanceof BookingSlotConflictError || isExclusionViolationError(error);

        if (isConflict && index < candidates.length - 1) continue;
        if (isConflict) this.throwSlotUnavailable();
        throw error;
      }
    }

    return this.throwSlotUnavailable();
  }

  private async placeOnStaff(
    transaction: TransactionClient,
    input: PlaceBookingInput,
    business: { id: string; timeZone: string; settings: unknown },
    service: AvailabilityServiceRecord,
    staffId: string,
  ): Promise<BookingRecord> {
    const now = new Date();

    await bookingDal.lockStaff(transaction, business.id, [staffId]);
    await bookingDal.lockResources(transaction, business.id, this.resourceIds(service));
    await bookingDal.expireStaleHolds(transaction, business.id, staffId, now);

    const slot = await availabilityService.findSlot({
      client: transaction,
      business,
      service,
      staffId,
      startsAt: input.startsAt,
      mode: input.mode,
      now,
    });

    if (!slot) throw new BookingSlotConflictError();

    const policy = resolveBookingPolicy(business.settings, service.policyOverrides);
    const provider = service.providers.find((item) => item.staffId === staffId);
    const durationMinutes = provider?.customDurationMinutes ?? service.durationMinutes;
    const id = randomUUID();

    return bookingDal.insertBooking(
      transaction,
      {
        id,
        businessId: business.id,
        userId: input.userId,
        customerId: input.customerId,
        serviceId: service.id,
        staffId,
        chatSessionId: input.chatSessionId,
        serviceName: service.name,
        timeZone: business.timeZone,
        ...this.scheduleFields(service, staffId, input.startsAt, durationMinutes, id),
        seats: 1,
        priceMinor: provider?.customPriceMinor ?? service.priceMinor,
        currency: service.currency,
        status: input.initialStatus,
        source: input.source,
        notes: input.notes,
        holdExpiresAt:
          input.initialStatus === "HELD"
            ? new Date(now.getTime() + policy.holdMinutes * MILLISECONDS_PER_MINUTE)
            : null,
      },
      input.actor,
    );
  }

  /** Open start times for a service from `from` onwards, for suggesting alternatives. */
  public async suggestStartTimes(
    businessId: string,
    serviceId: string,
    from: Date,
    count: number,
  ): Promise<Date[]> {
    const [business, service] = await Promise.all([
      businessDal.findBusinessById(businessId),
      availabilityDal.findBookableService(businessId, serviceId),
    ]);

    if (!business || !service?.onlineBookable) return [];

    const slots = await availabilityService.findNextSlots({
      business,
      service,
      from: new Date(Math.max(from.getTime(), Date.now())),
      count,
    });

    return slots.map((slot) => slot.startsAt);
  }

  public findHeldForUser(userId: string, bookingId: string): Promise<BookingRecord | null> {
    return bookingDal.findForUser(userId, bookingId);
  }

  // ---------------------------------------------------------------------------
  // Customer side

  /** Holds a slot for the signed-in customer while they confirm. */
  public async createHold(
    userId: string,
    request: CreateHoldRequest,
  ): Promise<AppointmentResponse> {
    const business = await businessService.getPublicBusiness(request.businessSlug);

    assertUuid("serviceId", request.serviceId);
    if (request.staffId) assertUuid("staffId", request.staffId);

    const booking = await this.holdForUser({
      businessId: business.id,
      serviceId: request.serviceId,
      startsAt: request.startsAt,
      userId,
      chatSessionId: null,
      notes: this.normalizeNotes(request.notes),
      source: "FORM",
      ...(request.staffId ? { staffId: request.staffId } : {}),
    });

    return this.toAppointmentResponse(booking);
  }

  /** Places a HELD booking for a user, resolving their customer record. */
  public async holdForUser(input: {
    businessId: string;
    serviceId: string;
    staffId?: string;
    startsAt: Date;
    userId: string;
    chatSessionId: string | null;
    notes: string | null;
    source: "FORM" | "CHAT";
  }): Promise<BookingRecord> {
    const user = await bookingDal.findUser(input.userId);

    if (!user) {
      throw new AppError(404, ERROR_CODES.USER_NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);
    }

    const customerId = await prisma.$transaction((transaction) =>
      bookingDal.resolveCustomerForUser(transaction, input.businessId, user),
    );

    return this.placeBooking({
      businessId: input.businessId,
      serviceId: input.serviceId,
      startsAt: input.startsAt,
      customerId,
      userId: input.userId,
      chatSessionId: input.chatSessionId,
      notes: input.notes,
      source: input.source,
      actor: { type: "CUSTOMER", userId: input.userId },
      mode: "CUSTOMER",
      initialStatus: "HELD",
      ...(input.staffId ? { staffId: input.staffId } : {}),
    });
  }

  public async confirmForCustomer(
    userId: string,
    bookingId: string,
  ): Promise<AppointmentResponse> {
    const booking = await this.getOwnedBooking(userId, bookingId);

    return this.toAppointmentResponse(
      await this.confirmHold(booking, { type: "CUSTOMER", userId }),
    );
  }

  /**
   * Turns a hold into a booking: CONFIRMED, or PENDING when the business
   * approves bookings by hand. A lapsed hold is kept only if its slot is
   * still free. Confirming again is a no-op.
   */
  public async confirmHold(
    booking: BookingRecord,
    actor: BookingActor,
    extraPatch: { chatSessionId?: string } = {},
  ): Promise<BookingRecord> {
    if (booking.status === "CONFIRMED" || booking.status === "PENDING") return booking;

    if (booking.status !== "HELD") this.throwTransitionNotAllowed();

    const outcome = await this.mapBookingErrors(() =>
      prisma.$transaction(async (transaction) => {
        const current = await this.lockAndReload(transaction, booking);

        if (current.status !== "HELD") return { booking: current, expired: false };

        const now = new Date();
        const lapsed = current.holdExpiresAt !== null && current.holdExpiresAt <= now;

        if (lapsed && !(await this.slotStillFree(transaction, current, now))) {
          const expired = await bookingDal.transition(transaction, current, "EXPIRE", {
            type: "SYSTEM",
            userId: null,
          });

          return { booking: expired, expired: true };
        }

        const policy = resolveBookingPolicy(
          current.business.settings,
          current.service?.policyOverrides,
        );
        const event: BookingEventType = policy.autoConfirmBookings
          ? "CONFIRM"
          : "REQUEST_APPROVAL";
        const confirmed = await bookingDal.transition(transaction, current, event, actor, {
          holdExpiresAt: null,
          ...extraPatch,
        });

        return { booking: confirmed, expired: false };
      }),
    );

    if (outcome.expired) {
      bookingMetrics.attempt("conflict", { source: booking.source, mode: "CONFIRM" });
      throw new AppError(
        409,
        ERROR_CODES.BOOKING_HOLD_EXPIRED,
        ERROR_MESSAGES.BOOKING_HOLD_EXPIRED,
      );
    }

    if (outcome.booking.status === "CONFIRMED" || outcome.booking.status === "PENDING") {
      bookingMetrics.holdConfirmed(
        (Date.now() - booking.createdAt.getTime()) / MILLISECONDS_PER_SECOND,
        booking.source,
      );
    }

    return outcome.booking;
  }

  /** Releases a hold the customer no longer wants (for example after changing details). */
  public async releaseHold(booking: BookingRecord, actor: BookingActor): Promise<void> {
    if (booking.status !== "HELD") return;

    await prisma
      .$transaction((transaction) =>
        bookingDal.transition(transaction, booking, "CANCEL", actor, {
          cancelledBy: actor.type,
          cancelledAt: new Date(),
          cancelReason: "Hold released",
        }),
      )
      .catch((error: unknown) => {
        // Already expired or confirmed elsewhere: nothing left to release.
        if (!(error instanceof BookingTransitionError)) throw error;
      });
  }

  public async getForCustomer(userId: string, bookingId: string): Promise<AppointmentResponse> {
    return this.toAppointmentResponse(await this.getOwnedBooking(userId, bookingId));
  }

  public async listForCustomer(
    userId: string,
    options: ListAppointmentsOptions,
  ): Promise<AppointmentListResponse> {
    const limit = this.validateLimit(options.limit, BUSINESS_CONSTANTS.MAX_PAGE_SIZE);
    const cursor = this.decodeCursor(options.cursor);
    const records = await bookingDal.listForUser({
      userId,
      ...(options.status ? { status: options.status } : {}),
      ...(cursor ? { cursor } : {}),
      take: limit + 1,
    });
    const page = records.slice(0, limit);
    const last = page.at(-1);

    return {
      items: page.map((booking) => this.toAppointmentResponse(booking)),
      ...(records.length > limit && last
        ? { nextCursor: encodeTimestampCursor(last.id, last.createdAt) }
        : {}),
    };
  }

  public async cancelForCustomer(
    userId: string,
    bookingId: string,
    reason: string | undefined,
  ): Promise<AppointmentResponse> {
    const booking = await this.getOwnedBooking(userId, bookingId);

    if (booking.status === "CANCELLED") return this.toAppointmentResponse(booking);

    if (!this.customerCanCancel(booking, new Date())) {
      throw new AppError(
        409,
        ERROR_CODES.APPOINTMENT_CANCELLATION_NOT_ALLOWED,
        ERROR_MESSAGES.APPOINTMENT_CANCELLATION_NOT_ALLOWED,
      );
    }

    return this.toAppointmentResponse(
      await this.cancel(booking, { type: "CUSTOMER", userId }, reason),
    );
  }

  public async rescheduleForCustomer(
    userId: string,
    bookingId: string,
    request: RescheduleAppointmentRequest,
  ): Promise<AppointmentResponse> {
    const booking = await this.getOwnedBooking(userId, bookingId);
    const startsAt = localDateTimeToUtc(
      request.scheduledDate,
      request.scheduledTime,
      booking.timeZone,
    );

    if (!startsAt) {
      throwRequestValidationError(
        "scheduledDate",
        VALIDATION_MESSAGES.APPOINTMENT_RESCHEDULE_TIME,
      );
    }

    return this.rescheduleOwnedBooking(userId, booking, startsAt);
  }

  /** Moves a customer's own booking to an exact start time, keeping its provider. */
  public async rescheduleForCustomerAt(
    userId: string,
    bookingId: string,
    startsAt: Date,
  ): Promise<AppointmentResponse> {
    return this.rescheduleOwnedBooking(userId, await this.getOwnedBooking(userId, bookingId), startsAt);
  }

  /** The customer's upcoming bookings at one business, soonest first. */
  public async listUpcomingForCustomerAt(
    userId: string,
    businessId: string,
    limit: number,
  ): Promise<AppointmentResponse[]> {
    const records = await bookingDal.listUpcomingForUserAtBusiness(userId, businessId, new Date(), limit);

    return records.map((record) => this.toAppointmentResponse(record));
  }

  private async rescheduleOwnedBooking(
    userId: string,
    booking: BookingRecord,
    startsAt: Date,
  ): Promise<AppointmentResponse> {
    if (!this.customerCanReschedule(booking, new Date())) {
      throw new AppError(
        409,
        ERROR_CODES.APPOINTMENT_RESCHEDULE_NOT_ALLOWED,
        ERROR_MESSAGES.APPOINTMENT_RESCHEDULE_NOT_ALLOWED,
      );
    }

    if (startsAt.getTime() <= Date.now()) {
      throwRequestValidationError(
        "scheduledDate",
        VALIDATION_MESSAGES.APPOINTMENT_RESCHEDULE_TIME,
      );
    }

    return this.toAppointmentResponse(
      await this.reschedule(booking, startsAt, undefined, { type: "CUSTOMER", userId }, "CUSTOMER"),
    );
  }

  // ---------------------------------------------------------------------------
  // Business side

  public async listForBusiness(
    businessId: string,
    options: ListBookingsOptions,
  ): Promise<BookingListResponse> {
    const limit = this.validateLimit(options.limit, BOOKING_CONSTANTS.MAX_PAGE_SIZE);
    const cursor = this.decodeCursor(options.cursor);

    if (options.staffId) assertUuid("staffId", options.staffId);

    if (
      options.from &&
      options.to &&
      (options.to <= options.from ||
        options.to.getTime() - options.from.getTime() >
          BOOKING_CONSTANTS.MAX_LIST_RANGE_DAYS * MILLISECONDS_PER_DAY)
    ) {
      throwRequestValidationError("to", VALIDATION_MESSAGES.BOOKING_LIST_RANGE);
    }

    const records = await bookingDal.listForBusiness({
      businessId,
      ...(options.status ? { status: options.status } : {}),
      ...(options.staffId ? { staffId: options.staffId } : {}),
      ...(options.from ? { from: options.from } : {}),
      ...(options.to ? { to: options.to } : {}),
      ...(cursor ? { cursor } : {}),
      take: limit + 1,
    });
    const page = records.slice(0, limit);
    const last = page.at(-1);

    return {
      items: page.map((booking) => this.toBookingResponse(booking)),
      ...(records.length > limit && last
        ? { nextCursor: encodeTimestampCursor(last.id, last.scheduledAt) }
        : {}),
    };
  }

  public async getForBusiness(businessId: string, bookingId: string): Promise<BookingResponse> {
    return this.toBookingResponse(await this.getBusinessBooking(businessId, bookingId));
  }

  public async listEvents(
    businessId: string,
    bookingId: string,
  ): Promise<BookingEventListResponse> {
    await this.getBusinessBooking(businessId, bookingId);

    return { items: await bookingDal.listEvents(businessId, bookingId) };
  }

  /** A booking taken by staff, for a walk-in or phone customer. Confirmed immediately. */
  public async createForStaff(
    businessId: string,
    actorUserId: string,
    request: CreateStaffBookingRequest,
  ): Promise<BookingResponse> {
    assertUuid("serviceId", request.serviceId);
    if (request.staffId) assertUuid("staffId", request.staffId);

    const customerId = await this.resolveStaffCustomer(businessId, request);
    const booking = await this.placeBooking({
      businessId,
      serviceId: request.serviceId,
      startsAt: request.startsAt,
      customerId,
      userId: null,
      chatSessionId: null,
      notes: this.normalizeNotes(request.notes),
      source: "STAFF",
      actor: { type: "STAFF", userId: actorUserId },
      mode: "STAFF",
      initialStatus: "CONFIRMED",
      ...(request.staffId ? { staffId: request.staffId } : {}),
    });

    return this.toBookingResponse(booking);
  }

  public async applyStaffAction(
    businessId: string,
    bookingId: string,
    actorUserId: string,
    action: "APPROVE" | "DECLINE" | "CHECK_IN" | "COMPLETE" | "MARK_NO_SHOW",
  ): Promise<BookingResponse> {
    const booking = await this.getBusinessBooking(businessId, bookingId);
    const actor: BookingActor = { type: "STAFF", userId: actorUserId };
    const now = new Date();

    if (action === "MARK_NO_SHOW") {
      const policy = resolveBookingPolicy(booking.business.settings, booking.service?.policyOverrides);
      const earliest =
        booking.scheduledAt.getTime() + policy.noShowGraceMinutes * MILLISECONDS_PER_MINUTE;

      if (now.getTime() < earliest) this.throwPolicyViolation();
    }

    const patch =
      action === "CHECK_IN"
        ? { checkedInAt: now }
        : action === "COMPLETE"
          ? { completedAt: now }
          : action === "DECLINE"
            ? { cancelledBy: "STAFF" as const, cancelledAt: now }
            : {};

    const updated = await this.mapBookingErrors(() =>
      prisma.$transaction((transaction) =>
        bookingDal.transition(transaction, booking, action, actor, patch),
      ),
    );

    return this.toBookingResponse(updated);
  }

  public async cancelForStaff(
    businessId: string,
    bookingId: string,
    actorUserId: string,
    reason: string | undefined,
  ): Promise<BookingResponse> {
    const booking = await this.getBusinessBooking(businessId, bookingId);

    return this.toBookingResponse(
      await this.cancel(booking, { type: "STAFF", userId: actorUserId }, reason),
    );
  }

  public async rescheduleForStaff(
    businessId: string,
    bookingId: string,
    actorUserId: string,
    request: StaffRescheduleRequest,
  ): Promise<BookingResponse> {
    const booking = await this.getBusinessBooking(businessId, bookingId);

    if (request.staffId) assertUuid("staffId", request.staffId);

    if (Number.isNaN(request.startsAt.getTime()) || request.startsAt.getTime() <= Date.now()) {
      throwRequestValidationError("startsAt", VALIDATION_MESSAGES.BOOKING_START);
    }

    return this.toBookingResponse(
      await this.reschedule(
        booking,
        request.startsAt,
        request.staffId,
        { type: "STAFF", userId: actorUserId },
        "STAFF",
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Shared lifecycle steps

  private async cancel(
    booking: BookingRecord,
    actor: BookingActor,
    reason: string | undefined,
  ): Promise<BookingRecord> {
    const cancelReason = reason?.trim() || null;

    if (cancelReason && cancelReason.length > BOOKING_CONSTANTS.MAX_CANCEL_REASON_LENGTH) {
      throwRequestValidationError("reason", VALIDATION_MESSAGES.CANCEL_REASON);
    }

    if (booking.status === "CANCELLED") return booking;

    return this.mapBookingErrors(() =>
      prisma.$transaction((transaction) =>
        bookingDal.transition(transaction, booking, "CANCEL", actor, {
          cancelledBy: actor.type,
          cancelledAt: new Date(),
          cancelReason,
        }),
      ),
    );
  }

  private async reschedule(
    booking: BookingRecord,
    startsAt: Date,
    newStaffId: string | undefined,
    actor: BookingActor,
    mode: "CUSTOMER" | "STAFF",
  ): Promise<BookingRecord> {
    if (!booking.serviceId || !booking.staffId) {
      throw new AppError(
        409,
        ERROR_CODES.APPOINTMENT_RESCHEDULE_NOT_ALLOWED,
        ERROR_MESSAGES.APPOINTMENT_RESCHEDULE_NOT_ALLOWED,
      );
    }

    const service = await availabilityDal.findBookableService(
      booking.businessId,
      booking.serviceId,
    );

    if (!service) this.throwServiceNotFound();

    const staffId = newStaffId ?? booking.staffId;
    const previousStaffId = booking.staffId;

    return this.mapBookingErrors(() =>
      prisma.$transaction(async (transaction) => {
        const now = new Date();

        await bookingDal.lockStaff(transaction, booking.businessId, [previousStaffId, staffId]);
        await bookingDal.lockResources(transaction, booking.businessId, this.resourceIds(service));
        await bookingDal.expireStaleHolds(transaction, booking.businessId, staffId, now);

        const current = await bookingDal.findForBusiness(
          booking.businessId,
          booking.id,
          transaction,
        );

        if (!current) this.throwBookingNotFound();

        const slot = await availabilityService.findSlot({
          client: transaction,
          business: { ...current.business, timeZone: current.timeZone },
          service,
          staffId,
          startsAt,
          mode,
          now,
          excludeBookingId: current.id,
        });

        if (!slot) throw new BookingSlotConflictError();

        const provider = service.providers.find((item) => item.staffId === staffId);
        const durationMinutes = provider?.customDurationMinutes ?? service.durationMinutes;

        return bookingDal.transition(
          transaction,
          current,
          "RESCHEDULE",
          actor,
          {
            staffId,
            ...this.scheduleFields(service, staffId, startsAt, durationMinutes, current.id),
            rescheduleCount: { increment: 1 },
          },
          {
            previousScheduledAt: current.scheduledAt.toISOString(),
            previousStaffId: current.staffId,
            scheduledAt: startsAt.toISOString(),
            staffId,
          },
        );
      }),
    );
  }

  private async lockAndReload(
    transaction: TransactionClient,
    booking: BookingRecord,
  ): Promise<BookingRecord> {
    if (booking.staffId) {
      await bookingDal.lockStaff(transaction, booking.businessId, [booking.staffId]);
    }

    const current = await bookingDal.findForBusiness(booking.businessId, booking.id, transaction);

    if (!current) this.throwBookingNotFound();

    return current;
  }

  private async slotStillFree(
    transaction: TransactionClient,
    booking: BookingRecord,
    now: Date,
  ): Promise<boolean> {
    if (!booking.serviceId || !booking.staffId) return false;

    const service = await availabilityDal.findBookableService(
      booking.businessId,
      booking.serviceId,
      transaction,
    );

    if (!service) return false;

    await bookingDal.lockResources(transaction, booking.businessId, this.resourceIds(service));

    const slot = await availabilityService.findSlot({
      client: transaction,
      business: { ...booking.business, timeZone: booking.timeZone },
      service,
      staffId: booking.staffId,
      startsAt: booking.scheduledAt,
      mode: "STAFF",
      now,
      excludeBookingId: booking.id,
    });

    return slot !== null;
  }

  /** Times, buffers and session key for a booking starting at `startsAt`. */
  private scheduleFields(
    service: AvailabilityServiceRecord,
    staffId: string,
    startsAt: Date,
    durationMinutes: number,
    bookingId: string,
  ) {
    const endsAt = new Date(startsAt.getTime() + durationMinutes * MILLISECONDS_PER_MINUTE);

    return {
      scheduledAt: startsAt,
      endsAt,
      durationMinutes,
      bufferBeforeMin: service.bufferBeforeMin,
      bufferAfterMin: service.bufferAfterMin,
      occupiedFrom: new Date(
        startsAt.getTime() - service.bufferBeforeMin * MILLISECONDS_PER_MINUTE,
      ),
      occupiedUntil: new Date(
        endsAt.getTime() + service.bufferAfterMin * MILLISECONDS_PER_MINUTE,
      ),
      // Seats in one class session share a key so they may overlap each other.
      sessionKey:
        service.bookingType === "CLASS"
          ? [
              BOOKING_CONSTANTS.CLASS_SESSION_KEY_PREFIX,
              service.id,
              staffId,
              startsAt.toISOString(),
            ].join(":")
          : bookingId,
    };
  }

  private resourceIds(service: AvailabilityServiceRecord): string[] {
    return service.resources
      .filter(({ resource }) => resource.isActive)
      .map(({ resource }) => resource.id);
  }

  private async resolveStaffCustomer(
    businessId: string,
    request: CreateStaffBookingRequest,
  ): Promise<string> {
    if (request.customerId) {
      assertUuid("customerId", request.customerId);

      if (!(await bookingDal.customerExists(businessId, request.customerId))) {
        throw new AppError(
          404,
          ERROR_CODES.CUSTOMER_NOT_FOUND,
          ERROR_MESSAGES.CUSTOMER_NOT_FOUND,
        );
      }

      return request.customerId;
    }

    if (!request.customer) {
      throwRequestValidationError("customer", VALIDATION_MESSAGES.BOOKING_CUSTOMER);
    }

    const customer = await customerService.createCustomer(businessId, {
      name: normalizeWhitespace(request.customer.name),
      ...(request.customer.email ? { email: normalizeEmail(request.customer.email) } : {}),
      ...(request.customer.phone ? { phone: request.customer.phone } : {}),
    });

    return customer.id;
  }

  // ---------------------------------------------------------------------------
  // Policies

  private withinChangeWindow(booking: BookingRecord, now: Date): boolean {
    const policy = resolveBookingPolicy(booking.business.settings, booking.service?.policyOverrides);

    return (
      now.getTime() <=
      booking.scheduledAt.getTime() - policy.cancellationWindowHours * MILLISECONDS_PER_HOUR
    );
  }

  private customerCanCancel(booking: BookingRecord, now: Date): boolean {
    if (booking.status === "HELD" || booking.status === "PENDING_PAYMENT") return true;

    return (
      (BOOKING_CONSTANTS.CUSTOMER_CHANGEABLE_STATUSES as readonly string[]).includes(
        booking.status,
      ) && this.withinChangeWindow(booking, now)
    );
  }

  private customerCanReschedule(booking: BookingRecord, now: Date): boolean {
    const policy = resolveBookingPolicy(booking.business.settings, booking.service?.policyOverrides);

    return (
      booking.serviceId !== null &&
      booking.staffId !== null &&
      (BOOKING_CONSTANTS.CUSTOMER_CHANGEABLE_STATUSES as readonly string[]).includes(
        booking.status,
      ) &&
      booking.rescheduleCount < policy.rescheduleLimit &&
      this.withinChangeWindow(booking, now)
    );
  }

  // ---------------------------------------------------------------------------
  // Lookups, errors and mapping

  private async getOwnedBooking(userId: string, bookingId: string): Promise<BookingRecord> {
    assertUuid("appointmentId", bookingId);

    const booking = await bookingDal.findForUser(userId, bookingId);

    if (!booking) this.throwBookingNotFound();

    return booking;
  }

  private async getBusinessBooking(businessId: string, bookingId: string): Promise<BookingRecord> {
    assertUuid("bookingId", bookingId);

    const booking = await bookingDal.findForBusiness(businessId, bookingId);

    if (!booking) this.throwBookingNotFound();

    return booking;
  }

  private async mapBookingErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof BookingSlotConflictError || isExclusionViolationError(error)) {
        this.throwSlotUnavailable();
      }

      if (error instanceof BookingTransitionError) this.throwTransitionNotAllowed();

      throw error;
    }
  }

  private normalizeNotes(notes: string | undefined): string | null {
    const value = notes?.trim() || null;

    if (value && value.length > BOOKING_CONSTANTS.MAX_NOTES_LENGTH) {
      throwRequestValidationError("notes", VALIDATION_MESSAGES.APPOINTMENT_NOTES);
    }

    return value;
  }

  private validateLimit(limit: number | undefined, max: number): number {
    const value = limit ?? BOOKING_CONSTANTS.DEFAULT_PAGE_SIZE;

    if (!Number.isInteger(value) || value < 1 || value > max) {
      throwRequestValidationError("limit", VALIDATION_MESSAGES.PAGINATION_LIMIT);
    }

    return value;
  }

  private decodeCursor(cursor: string | undefined) {
    if (!cursor) return undefined;

    const decoded = decodeTimestampCursor(cursor);

    if (!decoded) {
      throw new AppError(
        422,
        ERROR_CODES.INVALID_PAGINATION_CURSOR,
        ERROR_MESSAGES.INVALID_PAGINATION_CURSOR,
        { cursor: [ERROR_MESSAGES.INVALID_PAGINATION_CURSOR] },
      );
    }

    return decoded;
  }

  public toAppointmentResponse(booking: BookingRecord): AppointmentResponse {
    const now = new Date();

    return {
      id: booking.id,
      business: {
        id: booking.business.id,
        name: booking.business.name,
        slug: booking.business.slug,
      },
      serviceId: booking.serviceId,
      serviceName: booking.serviceName,
      staff: booking.staff ? { id: booking.staff.id, name: booking.staff.displayName } : null,
      scheduledAt: booking.scheduledAt,
      endsAt: booking.endsAt,
      timeZone: booking.timeZone,
      durationMinutes: booking.durationMinutes,
      status: booking.status,
      source: booking.source,
      notes: booking.notes,
      priceMinor: booking.priceMinor,
      currency: booking.currency,
      holdExpiresAt: booking.holdExpiresAt,
      cancelReason: booking.cancelReason,
      rescheduleCount: booking.rescheduleCount,
      canCancel: this.customerCanCancel(booking, now),
      canReschedule: this.customerCanReschedule(booking, now),
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  public toBookingResponse(booking: BookingRecord): BookingResponse {
    return {
      id: booking.id,
      customer: booking.customer,
      serviceId: booking.serviceId,
      serviceName: booking.serviceName,
      staff: booking.staff ? { id: booking.staff.id, name: booking.staff.displayName } : null,
      scheduledAt: booking.scheduledAt,
      endsAt: booking.endsAt,
      timeZone: booking.timeZone,
      durationMinutes: booking.durationMinutes,
      seats: booking.seats,
      status: booking.status,
      source: booking.source,
      notes: booking.notes,
      priceMinor: booking.priceMinor,
      currency: booking.currency,
      holdExpiresAt: booking.holdExpiresAt,
      cancelledBy: booking.cancelledBy,
      cancelReason: booking.cancelReason,
      rescheduleCount: booking.rescheduleCount,
      checkedInAt: booking.checkedInAt,
      completedAt: booking.completedAt,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  private throwSlotUnavailable(): never {
    throw new AppError(
      409,
      ERROR_CODES.APPOINTMENT_SLOT_UNAVAILABLE,
      ERROR_MESSAGES.APPOINTMENT_SLOT_UNAVAILABLE,
    );
  }

  private throwTransitionNotAllowed(): never {
    throw new AppError(
      409,
      ERROR_CODES.BOOKING_TRANSITION_NOT_ALLOWED,
      ERROR_MESSAGES.BOOKING_TRANSITION_NOT_ALLOWED,
    );
  }

  private throwPolicyViolation(): never {
    throw new AppError(
      409,
      ERROR_CODES.BOOKING_POLICY_VIOLATION,
      ERROR_MESSAGES.BOOKING_POLICY_VIOLATION,
    );
  }

  private throwBookingNotFound(): never {
    throw new AppError(
      404,
      ERROR_CODES.APPOINTMENT_NOT_FOUND,
      ERROR_MESSAGES.APPOINTMENT_NOT_FOUND,
    );
  }

  private throwServiceNotFound(): never {
    throw new AppError(404, ERROR_CODES.SERVICE_NOT_FOUND, ERROR_MESSAGES.SERVICE_NOT_FOUND);
  }

  private throwBusinessNotFound(): never {
    throw new AppError(404, ERROR_CODES.BUSINESS_NOT_FOUND, ERROR_MESSAGES.BUSINESS_NOT_FOUND);
  }
}

export const bookingService = new BookingService();
