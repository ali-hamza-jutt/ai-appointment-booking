import type { Queue } from "bullmq";

import { JOB_CONSTANTS, NOTIFICATION_CONSTANTS } from "../../constants/app.constants.js";
import { createQueue } from "../../infrastructure/queue/queues.js";
import type { NotificationJobData, PlannedReminder, ReviewRequestJobData } from "./dto/notification.dto.js";

/** Puts reminders on (and takes them off) the notifications queue as delayed jobs. */
export interface ReminderScheduler {
  schedule(booking: { bookingId: string; businessId: string; scheduledAt: Date }, reminders: PlannedReminder[], now: Date): Promise<void>;
  cancel(booking: { bookingId: string; scheduledAt: Date }, offsetsMinutes: readonly number[]): Promise<void>;
  /** Asks the customer to rate a finished visit at `sendAt`; once per booking. */
  scheduleReviewRequest(booking: ReviewRequestJobData, sendAt: Date, now: Date): Promise<void>;
}

/**
 * One job per booking, start time and offset. The start is part of the id,
 * so a moved booking gets fresh jobs, and a job left behind for the old
 * start finds the booking changed and sends nothing.
 */
export function reminderJobId(bookingId: string, scheduledAt: Date, offsetMinutes: number): string {
  return `reminder-${bookingId}-${scheduledAt.getTime()}-${offsetMinutes}`;
}

export class QueueReminderScheduler implements ReminderScheduler {
  private queue: Queue<NotificationJobData> | null = null;

  public async schedule(
    booking: { bookingId: string; businessId: string; scheduledAt: Date },
    reminders: PlannedReminder[],
    now: Date,
  ): Promise<void> {
    const queue = this.getQueue();

    for (const reminder of reminders) {
      await queue.add(
        NOTIFICATION_CONSTANTS.REMINDER_JOB,
        {
          bookingId: booking.bookingId,
          businessId: booking.businessId,
          offsetMinutes: reminder.offsetMinutes,
          scheduledAt: booking.scheduledAt.toISOString(),
        },
        {
          // Adding a job whose id exists is a no-op, so a repeated event schedules nothing new.
          jobId: reminderJobId(booking.bookingId, booking.scheduledAt, reminder.offsetMinutes),
          delay: Math.max(0, reminder.sendAt.getTime() - now.getTime()),
        },
      );
    }
  }

  public async cancel(booking: { bookingId: string; scheduledAt: Date }, offsetsMinutes: readonly number[]): Promise<void> {
    const queue = this.getQueue();

    await Promise.all(
      [...new Set(offsetsMinutes)].map((offset) =>
        queue.remove(reminderJobId(booking.bookingId, booking.scheduledAt, offset)),
      ),
    );
  }

  public async scheduleReviewRequest(booking: ReviewRequestJobData, sendAt: Date, now: Date): Promise<void> {
    await this.getQueue().add(
      NOTIFICATION_CONSTANTS.REVIEW_REQUEST_JOB,
      { bookingId: booking.bookingId, businessId: booking.businessId },
      { jobId: `review-request-${booking.bookingId}`, delay: Math.max(0, sendAt.getTime() - now.getTime()) },
    );
  }

  /** Releases the queue's Redis connection. */
  public async close(): Promise<void> {
    await this.queue?.close();
    this.queue = null;
  }

  private getQueue(): Queue<NotificationJobData> {
    this.queue ??= createQueue<NotificationJobData>(JOB_CONSTANTS.QUEUES.NOTIFICATIONS);

    return this.queue;
  }
}
