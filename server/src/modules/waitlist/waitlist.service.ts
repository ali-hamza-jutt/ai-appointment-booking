import { logger } from "../../config/logger.js";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_PATTERNS,
  WAITLIST_CONSTANTS,
} from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import {
  addDaysToLocalDate,
  getLocalDateTimeValues,
  isValidLocalDate,
  normalizeIanaTimeZone,
} from "../../utils/time-zone.js";
import { throwRequestValidationError } from "../../utils/validation.js";
import { bookingService } from "../bookings/booking.service.js";
import { businessService } from "../businesses/business.service.js";
import { catalogService } from "../catalog/catalog.service.js";
import { customerProfileDal } from "../customers/dal/customer-profile.dal.js";
import { notificationService } from "../notifications/notification.service.js";
import type { OutboxMessage } from "../outbox/dto/outbox.dto.js";
import { staffService } from "../staff/staff.service.js";
import { waitlistDal } from "./dal/waitlist.dal.js";
import type {
  BusinessWaitlistListResponse,
  FreedTime,
  JoinWaitlistInput,
  JoinWaitlistRequest,
  WaitlistEntryRecord,
  WaitlistEntryResponse,
  WaitlistListResponse,
  WaitlistPartOfDay,
} from "./dto/waitlist.dto.js";
import { suitsWaitlistEntry } from "./waitlist-matching.js";

const FREEING = new Set<string>(WAITLIST_CONSTANTS.FREEING_EVENTS);
const ACCEPTING = new Set<string>(WAITLIST_CONSTANTS.ACCEPTING_EVENTS);
/** A booking that held these statuses occupied its time, so ending it frees the time. */
const OCCUPYING = new Set(["HELD", "PENDING_PAYMENT", "PENDING", "CONFIRMED"]);

function isPartOfDay(value: string): value is WaitlistPartOfDay {
  return (WAITLIST_CONSTANTS.PARTS_OF_DAY as readonly string[]).includes(value);
}

function toDate(localDate: string): Date {
  return new Date(`${localDate}T00:00:00Z`);
}

/**
 * The waitlist. Customers wait for a service between two dates; when a
 * booking gives its time back, the first suitable customer gets it held for
 * 15 minutes and a message to confirm, and if they let it go it passes to
 * the next in line.
 */
export class WaitlistService {
  /** Joins through a booking link. */
  public async join(userId: string, request: JoinWaitlistRequest): Promise<WaitlistEntryResponse> {
    const business = await businessService.getPublicBusiness(request.businessSlug);

    return this.joinAt(userId, business, request);
  }

  /** Joins at a known business, for example from the chat. Joining the same wait twice returns the first entry. */
  public async joinAt(
    userId: string,
    business: { id: string; slug: string },
    input: JoinWaitlistInput,
  ): Promise<WaitlistEntryResponse> {
    const timeZone = normalizeIanaTimeZone(input.timeZone);

    if (!timeZone) throwRequestValidationError("timeZone", "Time zone must be a valid IANA time zone");

    const service = await catalogService.findBookableService(business.id, input.serviceId);

    if (!service) throw new AppError(404, ERROR_CODES.SERVICE_NOT_FOUND, ERROR_MESSAGES.SERVICE_NOT_FOUND);

    if (input.staffId) {
      const providers = await staffService.listPublicStaff(business.slug, service.id);

      if (!providers.items.some((member) => member.id === input.staffId)) {
        throw new AppError(404, ERROR_CODES.STAFF_NOT_FOUND, ERROR_MESSAGES.STAFF_NOT_FOUND);
      }
    }

    const range = this.validateRange(input.fromDate, input.toDate, timeZone);
    const partOfDay = input.partOfDay ? input.partOfDay.toLowerCase() : null;

    if (partOfDay && !isPartOfDay(partOfDay)) {
      throwRequestValidationError("partOfDay", "Part of day must be morning, afternoon or evening");
    }

    const customerId = await customerProfileDal.resolveCustomerIdForUser(business.id, userId);

    if (!customerId) throw new AppError(404, ERROR_CODES.USER_NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);

    const data = {
      businessId: business.id,
      customerId,
      userId,
      serviceId: service.id,
      staffId: input.staffId ?? null,
      fromDate: toDate(range.from),
      toDate: toDate(range.to),
      partOfDay,
      timeZone,
    };
    const existing = await waitlistDal.findSame(data);

    if (existing) return this.toResponse(existing);

    if ((await waitlistDal.countActive(business.id, userId)) >= WAITLIST_CONSTANTS.MAX_ACTIVE_ENTRIES) {
      throw new AppError(409, ERROR_CODES.WAITLIST_LIMIT_REACHED, ERROR_MESSAGES.WAITLIST_LIMIT_REACHED);
    }

    return this.toResponse(await waitlistDal.createEntry(data));
  }

  public async listMine(userId: string): Promise<WaitlistListResponse> {
    const entries = await waitlistDal.listForUser(userId, WAITLIST_CONSTANTS.LIST_LIMIT);

    return { items: entries.map((entry) => this.toResponse(entry)) };
  }

  public async listForBusiness(businessId: string): Promise<BusinessWaitlistListResponse> {
    const entries = await waitlistDal.listForBusiness(businessId, WAITLIST_CONSTANTS.LIST_LIMIT);

    return { items: entries.map((entry) => ({ ...this.toResponse(entry), customer: entry.customer })) };
  }

  /** Leaves the waitlist. A time held for the customer is let go, so it passes to the next person. */
  public async leave(userId: string, entryId: string): Promise<void> {
    const entry = VALIDATION_PATTERNS.UUID.test(entryId) ? await waitlistDal.findForUser(userId, entryId) : null;

    if (!entry || entry.status === "LEFT" || entry.status === "BOOKED") {
      throw new AppError(404, ERROR_CODES.WAITLIST_ENTRY_NOT_FOUND, ERROR_MESSAGES.WAITLIST_ENTRY_NOT_FOUND);
    }

    await waitlistDal.setEntryStatus(entry.businessId, entry.id, "LEFT", ["WAITING", "OFFERED"]);

    const offer = entry.offers[0];

    if (offer) {
      const hold = await bookingService.getOwnedRecord(userId, offer.bookingId).catch(() => null);

      if (hold) await bookingService.releaseHold(hold, { type: "CUSTOMER", userId });
    }
  }

  /**
   * Follows bookings: a taken-up offer books the entry, a lapsed or released
   * offer puts the customer back in line, and any time given back is offered on.
   */
  public async handleBookingEvent(message: OutboxMessage): Promise<void> {
    const { bookingId, serviceId, staffId, scheduledAt, previousStatus } = message.payload;

    if (!message.businessId || typeof bookingId !== "string") return;

    const offer = await waitlistDal.findOfferByBooking(message.businessId, bookingId);

    if (ACCEPTING.has(message.type)) {
      if (offer && (await waitlistDal.setOfferStatus(offer, "ACCEPTED", ["OPEN"]))) {
        await waitlistDal.setEntryStatus(offer.businessId, offer.entryId, "BOOKED", ["OFFERED", "WAITING"]);
      }
      return;
    }

    if (!FREEING.has(message.type)) return;

    if (offer) {
      const outcome = message.type === "booking.expired" ? "LAPSED" : "DECLINED";

      if (await waitlistDal.setOfferStatus(offer, outcome, ["OPEN"])) {
        await waitlistDal.setEntryStatus(offer.businessId, offer.entryId, "WAITING", ["OFFERED"]);
      }
    }

    if (
      typeof serviceId !== "string" ||
      typeof scheduledAt !== "string" ||
      typeof previousStatus !== "string" ||
      !OCCUPYING.has(previousStatus)
    ) {
      return;
    }

    await this.offerFreedTime({
      businessId: message.businessId,
      serviceId,
      staffId: typeof staffId === "string" ? staffId : null,
      startsAt: new Date(scheduledAt),
    });
  }

  /**
   * Holds a freed time for the first waiting customer it suits and tells
   * them. Stops as soon as the time turns out not to be bookable online for
   * anyone (taken again, too soon, outside the booking window).
   */
  public async offerFreedTime(freed: FreedTime, now: Date = new Date()): Promise<boolean> {
    if (freed.startsAt <= now) return false;

    const candidates = await waitlistDal.listCandidates(
      freed.businessId,
      freed.serviceId,
      freed.startsAt,
      freed.staffId,
      WAITLIST_CONSTANTS.MAX_CANDIDATES,
    );

    for (const entry of candidates) {
      if (
        !suitsWaitlistEntry(
          { ...entry, fromDate: this.localDate(entry.fromDate), toDate: this.localDate(entry.toDate) },
          freed,
        )
      ) {
        continue;
      }

      let hold;

      try {
        hold = await bookingService.holdForUser({
          businessId: freed.businessId,
          serviceId: freed.serviceId,
          startsAt: freed.startsAt,
          userId: entry.userId,
          chatSessionId: null,
          notes: null,
          source: "WAITLIST",
          holdMinutes: WAITLIST_CONSTANTS.OFFER_HOLD_MINUTES,
          ...(freed.staffId ? { staffId: freed.staffId } : {}),
        });
      } catch (error) {
        // Only a problem with this one customer moves on to the next.
        if (error instanceof AppError && error.code === ERROR_CODES.USER_NOT_FOUND) continue;
        if (error instanceof AppError && error.statusCode < 500) return false;
        throw error;
      }

      await waitlistDal.createOffer({
        businessId: freed.businessId,
        entryId: entry.id,
        bookingId: hold.id,
        staffId: freed.staffId,
        startsAt: freed.startsAt,
        expiresAt: hold.holdExpiresAt ?? freed.startsAt,
      });
      await waitlistDal.setEntryStatus(entry.businessId, entry.id, "OFFERED", ["WAITING"]);
      await notificationService.sendWaitlistOffer(freed.businessId, hold.id).catch((error: unknown) => {
        // The hold stands and shows in the customer's appointments even if the message failed.
        logger.warn({ err: error, bookingId: hold.id }, "Sending a waitlist offer failed");
      });

      return true;
    }

    return false;
  }

  private validateRange(from: string, to: string, timeZone: string): { from: string; to: string } {
    if (!isValidLocalDate(from)) throwRequestValidationError("fromDate", "Use a date in YYYY-MM-DD form");
    if (!isValidLocalDate(to)) throwRequestValidationError("toDate", "Use a date in YYYY-MM-DD form");

    const today = getLocalDateTimeValues(new Date(), timeZone)?.date ?? new Date().toISOString().slice(0, 10);
    const start = from < today ? today : from;

    if (to < start) throwRequestValidationError("toDate", "The last date must be today or later, and not before the first");

    if (to > addDaysToLocalDate(start, WAITLIST_CONSTANTS.MAX_RANGE_DAYS - 1)) {
      throwRequestValidationError("toDate", `Wait for at most ${WAITLIST_CONSTANTS.MAX_RANGE_DAYS} days at a time`);
    }

    return { from: start, to };
  }

  private localDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toResponse(entry: WaitlistEntryRecord): WaitlistEntryResponse {
    const offer = entry.offers[0];

    return {
      id: entry.id,
      business: entry.business,
      service: entry.service,
      staff: entry.staff ? { id: entry.staff.id, name: entry.staff.displayName } : null,
      fromDate: this.localDate(entry.fromDate),
      toDate: this.localDate(entry.toDate),
      partOfDay: entry.partOfDay && isPartOfDay(entry.partOfDay) ? entry.partOfDay : null,
      timeZone: entry.timeZone,
      status: entry.status,
      offer: offer ? { bookingId: offer.bookingId, startsAt: offer.startsAt, expiresAt: offer.expiresAt } : null,
      createdAt: entry.createdAt,
    };
  }
}

export const waitlistService = new WaitlistService();
