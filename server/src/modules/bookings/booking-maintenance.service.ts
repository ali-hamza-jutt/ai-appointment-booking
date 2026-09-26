import { logger } from "../../config/logger.js";
import { JOB_CONSTANTS } from "../../constants/app.constants.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { DEFAULT_BUSINESS_SETTINGS } from "../businesses/business-settings.js";
import { resolveBookingPolicy } from "./booking-policy.js";
import {
  bookingDal,
  BookingTransitionError,
  type BookingPatch,
  type BookingReference,
} from "./dal/booking.dal.js";
import type { BookingActor, BookingEventType, BookingRecord } from "./dto/booking.dto.js";

const MILLISECONDS_PER_MINUTE = 60_000;
const SYSTEM_ACTOR: BookingActor = { type: "SYSTEM", userId: null };

/**
 * Time-driven booking changes run by the worker. Each booking changes in
 * its own transaction through the state machine, so a booking that staff
 * updated in the meantime is skipped rather than overwritten.
 */
export class BookingMaintenanceService {
  public async expireLapsedHolds(now = new Date()): Promise<number> {
    const candidates = await bookingDal.findLapsedHolds(now, JOB_CONSTANTS.MAINTENANCE_BATCH_SIZE);

    return this.applyEach(candidates, "EXPIRE", (booking) =>
      booking.holdExpiresAt && booking.holdExpiresAt <= now ? {} : null,
    );
  }

  public async markNoShows(now = new Date()): Promise<number> {
    const candidates = await bookingDal.findNoShowCandidates(
      now,
      DEFAULT_BUSINESS_SETTINGS.noShowGraceMinutes,
      JOB_CONSTANTS.MAINTENANCE_BATCH_SIZE,
    );

    return this.applyEach(candidates, "MARK_NO_SHOW", (booking) => {
      const policy = resolveBookingPolicy(booking.business.settings, booking.service?.policyOverrides);
      const due = booking.scheduledAt.getTime() + policy.noShowGraceMinutes * MILLISECONDS_PER_MINUTE;

      return policy.autoMarkNoShows && due <= now.getTime() ? {} : null;
    });
  }

  public async completeFinishedVisits(now = new Date()): Promise<number> {
    const endedBefore = new Date(
      now.getTime() - JOB_CONSTANTS.AUTO_COMPLETE_AFTER_MINUTES * MILLISECONDS_PER_MINUTE,
    );
    const candidates = await bookingDal.findFinishedVisits(
      endedBefore,
      JOB_CONSTANTS.MAINTENANCE_BATCH_SIZE,
    );

    return this.applyEach(candidates, "COMPLETE", () => ({ completedAt: now }));
  }

  /** Applies `event` to each booking the guard accepts; returns how many changed. */
  private async applyEach(
    candidates: BookingReference[],
    event: BookingEventType,
    guard: (booking: BookingRecord) => BookingPatch | null,
  ): Promise<number> {
    let changed = 0;

    for (const candidate of candidates) {
      try {
        const applied = await prisma.$transaction(async (transaction) => {
          const booking = await bookingDal.findForBusiness(
            candidate.businessId,
            candidate.id,
            transaction,
          );
          const patch = booking ? guard(booking) : null;

          if (!booking || !patch) return false;

          await bookingDal.transition(transaction, booking, event, SYSTEM_ACTOR, patch);

          return true;
        });

        if (applied) changed += 1;
      } catch (error) {
        // Someone else moved the booking first; the next run sees its new state.
        if (error instanceof BookingTransitionError) continue;

        logger.error({ err: error, bookingId: candidate.id, event }, "Booking maintenance failed");
      }
    }

    return changed;
  }
}

export const bookingMaintenanceService = new BookingMaintenanceService();
