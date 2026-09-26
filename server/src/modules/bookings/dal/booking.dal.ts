import { randomUUID } from "node:crypto";

import { BOOKING_CONSTANTS } from "../../../constants/app.constants.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import {
  prisma,
  type DbClient,
  type TransactionClient,
} from "../../../infrastructure/database/prisma.js";
import { currentOutboxMeta } from "../../outbox/outbox-meta.js";
import { BOOKING_TRANSITIONS, nextStatus } from "../booking-state.js";
import type {
  BookingActor,
  BookingEventResponse,
  BookingEventType,
  BookingRecord,
  BookingStatus,
  ListBookingsData,
  ListCustomerBookingsData,
  NewBookingData,
} from "../dto/booking.dto.js";

export const bookingSelect = {
  id: true,
  businessId: true,
  userId: true,
  customerId: true,
  serviceId: true,
  staffId: true,
  chatSessionId: true,
  serviceName: true,
  scheduledAt: true,
  endsAt: true,
  timeZone: true,
  durationMinutes: true,
  bufferBeforeMin: true,
  bufferAfterMin: true,
  occupiedFrom: true,
  occupiedUntil: true,
  sessionKey: true,
  seats: true,
  priceMinor: true,
  currency: true,
  status: true,
  source: true,
  notes: true,
  holdExpiresAt: true,
  rescheduleCount: true,
  cancelledBy: true,
  cancelReason: true,
  cancelledAt: true,
  checkedInAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  business: { select: { id: true, name: true, slug: true, settings: true } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  staff: { select: { id: true, displayName: true } },
  service: { select: { policyOverrides: true } },
} as const;

export class BookingTransitionError extends Error {
  public constructor(event: BookingEventType, status: BookingStatus) {
    super(`Cannot apply ${event} to a ${status} booking`);
    this.name = "BookingTransitionError";
  }
}

export interface BookingReference {
  id: string;
  businessId: string;
}

export type BookingPatch = Omit<
  Prisma.BookingUncheckedUpdateManyInput,
  "id" | "businessId" | "status"
>;

export class BookingDal {
  /** Serializes schedule writes per provider; always lock in id order. */
  public async lockStaff(
    transaction: TransactionClient,
    businessId: string,
    staffIds: string[],
  ): Promise<void> {
    const ordered = [...new Set(staffIds)].sort();

    if (ordered.length === 0) return;

    await transaction.$queryRaw`
      SELECT "id" FROM "staff"
      WHERE "business_id" = ${businessId}::uuid AND "id" = ANY(${ordered}::uuid[])
      ORDER BY "id"
      FOR UPDATE
    `;
  }

  /** Serializes bookings that need the same room or equipment. */
  public async lockResources(
    transaction: TransactionClient,
    businessId: string,
    resourceIds: string[],
  ): Promise<void> {
    const ordered = [...new Set(resourceIds)].sort();

    if (ordered.length === 0) return;

    await transaction.$queryRaw`
      SELECT "id" FROM "resources"
      WHERE "business_id" = ${businessId}::uuid AND "id" = ANY(${ordered}::uuid[])
      ORDER BY "id"
      FOR UPDATE
    `;
  }

  /**
   * Expires this provider's lapsed holds inside the caller's transaction, so
   * correctness never depends on the background job having run.
   */
  public async expireStaleHolds(
    transaction: TransactionClient,
    businessId: string,
    staffId: string,
    now: Date,
  ): Promise<number> {
    const stale = await transaction.booking.findMany({
      where: { businessId, staffId, status: "HELD", holdExpiresAt: { lte: now } },
      select: bookingSelect,
    });

    for (const booking of stale) {
      await this.transition(transaction, booking, "EXPIRE", {
        type: "SYSTEM",
        userId: null,
      });
    }

    return stale.length;
  }

  public async insertBooking(
    transaction: TransactionClient,
    data: NewBookingData,
    actor: BookingActor,
  ): Promise<BookingRecord> {
    const booking = await transaction.booking.create({
      data,
      select: bookingSelect,
    });
    const event: BookingEventType = data.status === "HELD" ? "HOLD" : "CONFIRM";

    await this.recordEvent(transaction, booking, event, null, booking.status, actor, {
      scheduledAt: booking.scheduledAt.toISOString(),
      staffId: booking.staffId,
    });

    return booking;
  }

  /**
   * Applies a state-machine event. The update is guarded on the allowed
   * source statuses, so a concurrent change makes it fail instead of racing.
   */
  public async transition(
    transaction: TransactionClient,
    booking: BookingRecord,
    event: BookingEventType,
    actor: BookingActor,
    patch: BookingPatch = {},
    payload: Record<string, unknown> = {},
  ): Promise<BookingRecord> {
    const allowed = BOOKING_TRANSITIONS[event].from;

    if (!allowed.includes(booking.status)) {
      throw new BookingTransitionError(event, booking.status);
    }

    const toStatus = nextStatus(booking.status, event);
    const result = await transaction.booking.updateMany({
      where: {
        id: booking.id,
        businessId: booking.businessId,
        status: { in: [...allowed] },
      },
      data: { ...patch, status: toStatus },
    });

    if (result.count === 0) {
      throw new BookingTransitionError(event, booking.status);
    }

    const updated = await transaction.booking.findFirstOrThrow({
      where: { id: booking.id, businessId: booking.businessId },
      select: bookingSelect,
    });

    await this.recordEvent(
      transaction,
      updated,
      event,
      booking.status,
      toStatus,
      actor,
      payload,
    );

    return updated;
  }

  /** Holds and unpaid bookings past their expiry, across all businesses. */
  public findLapsedHolds(now: Date, limit: number): Promise<BookingReference[]> {
    return prisma.$queryRaw<BookingReference[]>`
      SELECT "id", "business_id" AS "businessId"
      FROM "bookings"
      WHERE "status" IN ('HELD', 'PENDING_PAYMENT') AND "hold_expires_at" <= ${now}
      ORDER BY "hold_expires_at"
      LIMIT ${limit}
    `;
  }

  /**
   * Confirmed bookings past their business's no-show grace period, for
   * businesses that opted in to automatic no-shows.
   */
  public findNoShowCandidates(
    now: Date,
    defaultGraceMinutes: number,
    limit: number,
  ): Promise<BookingReference[]> {
    return prisma.$queryRaw<BookingReference[]>`
      SELECT b."id", b."business_id" AS "businessId"
      FROM "bookings" b
      JOIN "businesses" biz ON biz."id" = b."business_id"
      WHERE b."status" = 'CONFIRMED'
        AND b."scheduled_at" <= ${now}
        AND COALESCE((biz."settings" ->> 'autoMarkNoShows')::boolean, false)
        AND b."scheduled_at" + make_interval(
          mins => COALESCE((biz."settings" ->> 'noShowGraceMinutes')::int, ${defaultGraceMinutes})
        ) <= ${now}
      ORDER BY b."scheduled_at"
      LIMIT ${limit}
    `;
  }

  /** Checked-in visits that ended before `endedBefore`, across all businesses. */
  public findFinishedVisits(endedBefore: Date, limit: number): Promise<BookingReference[]> {
    return prisma.$queryRaw<BookingReference[]>`
      SELECT "id", "business_id" AS "businessId"
      FROM "bookings"
      WHERE "status" = 'CHECKED_IN' AND "ends_at" <= ${endedBefore}
      ORDER BY "ends_at"
      LIMIT ${limit}
    `;
  }

  public findForBusiness(
    businessId: string,
    bookingId: string,
    client: DbClient = prisma,
  ): Promise<BookingRecord | null> {
    return client.booking.findFirst({
      where: { id: bookingId, businessId },
      select: bookingSelect,
    });
  }

  public findForUser(
    userId: string,
    bookingId: string,
    client: DbClient = prisma,
  ): Promise<BookingRecord | null> {
    return client.booking.findFirst({
      where: { id: bookingId, userId },
      select: bookingSelect,
    });
  }

  public listForBusiness(data: ListBookingsData): Promise<BookingRecord[]> {
    return prisma.booking.findMany({
      where: {
        businessId: data.businessId,
        ...(data.status ? { status: data.status } : {}),
        ...(data.staffId ? { staffId: data.staffId } : {}),
        ...(data.from || data.to
          ? {
              scheduledAt: {
                ...(data.from ? { gte: data.from } : {}),
                ...(data.to ? { lt: data.to } : {}),
              },
            }
          : {}),
        ...(data.cursor
          ? {
              OR: [
                { scheduledAt: { gt: data.cursor.timestamp } },
                { scheduledAt: data.cursor.timestamp, id: { gt: data.cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: data.take,
      select: bookingSelect,
    });
  }

  public listUpcomingForUserAtBusiness(
    userId: string,
    businessId: string,
    now: Date,
    take: number,
  ): Promise<BookingRecord[]> {
    return prisma.booking.findMany({
      where: {
        userId,
        businessId,
        status: { in: ["PENDING", "CONFIRMED", "PENDING_PAYMENT"] },
        scheduledAt: { gt: now },
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take,
      select: bookingSelect,
    });
  }

  public listForUser(data: ListCustomerBookingsData): Promise<BookingRecord[]> {
    return prisma.booking.findMany({
      where: {
        userId: data.userId,
        ...(data.status ? { status: data.status } : {}),
        ...(data.cursor
          ? {
              OR: [
                { createdAt: { lt: data.cursor.timestamp } },
                { createdAt: data.cursor.timestamp, id: { lt: data.cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: data.take,
      select: bookingSelect,
    });
  }

  public async listEvents(
    businessId: string,
    bookingId: string,
  ): Promise<BookingEventResponse[]> {
    const events = await prisma.bookingEvent.findMany({
      where: { businessId, bookingId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        fromStatus: true,
        toStatus: true,
        actorType: true,
        actorUserId: true,
        payload: true,
        createdAt: true,
      },
    });

    return events.map((event) => ({
      ...event,
      payload: (event.payload as Record<string, unknown> | null) ?? null,
    }));
  }

  /** Finds the customer record for a user at a business, creating or linking one. */
  public async resolveCustomerForUser(
    transaction: TransactionClient,
    businessId: string,
    user: { id: string; fullName: string; email: string },
  ): Promise<string> {
    const existing = await transaction.customer.findFirst({
      where: {
        businessId,
        OR: [{ userId: user.id }, { email: user.email, userId: null }],
      },
      orderBy: { userId: { sort: "asc", nulls: "last" } },
      select: { id: true, userId: true },
    });

    if (existing) {
      if (!existing.userId) {
        await transaction.customer.update({
          where: { id: existing.id, businessId },
          data: { userId: user.id },
        });
      }

      return existing.id;
    }

    const created = await transaction.customer.create({
      data: { businessId, userId: user.id, name: user.fullName, email: user.email },
      select: { id: true },
    });

    return created.id;
  }

  public findUser(
    userId: string,
  ): Promise<{ id: string; fullName: string; email: string } | null> {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true },
    });
  }

  public async customerExists(businessId: string, customerId: string): Promise<boolean> {
    return (await prisma.customer.count({ where: { id: customerId, businessId } })) > 0;
  }

  private async recordEvent(
    transaction: TransactionClient,
    booking: BookingRecord,
    event: BookingEventType,
    fromStatus: BookingStatus | null,
    toStatus: BookingStatus,
    actor: BookingActor,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await transaction.bookingEvent.create({
      data: {
        bookingId: booking.id,
        businessId: booking.businessId,
        type: event,
        fromStatus,
        toStatus,
        actorType: actor.type,
        actorUserId: actor.userId,
        payload: payload as Prisma.InputJsonObject,
      },
    });

    await transaction.outboxEvent.create({
      data: {
        id: randomUUID(),
        businessId: booking.businessId,
        type: BOOKING_TRANSITIONS[event].outboxType,
        aggregateType: BOOKING_CONSTANTS.AGGREGATE_TYPE,
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          businessId: booking.businessId,
          customerId: booking.customerId,
          userId: booking.userId,
          staffId: booking.staffId,
          serviceId: booking.serviceId,
          status: toStatus,
          previousStatus: fromStatus,
          scheduledAt: booking.scheduledAt.toISOString(),
          endsAt: booking.endsAt.toISOString(),
          timeZone: booking.timeZone,
          meta: { ...currentOutboxMeta() },
        },
      },
    });
  }
}

export const bookingDal = new BookingDal();
