import { APPOINTMENT_CONSTANTS } from "../../../constants/app.constants.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../infrastructure/database/prisma.js";
import { AppointmentSlotConflictError } from "../appointment-slot-conflict.error.js";
import type {
  AppointmentConflictQueryResult,
  AppointmentMutationData,
  AppointmentRecord,
  AppointmentScheduleData,
  CreateAppointmentData,
  ListAppointmentsData,
  RescheduleAppointmentData,
} from "../dto/appointment.dto.js";

export const appointmentSelect = {
  id: true,
  serviceName: true,
  scheduledAt: true,
  timeZone: true,
  durationMinutes: true,
  status: true,
  source: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class AppointmentDal {
  public async createAppointment(
    data: CreateAppointmentData,
  ): Promise<AppointmentRecord> {
    return prisma.$transaction(async (transaction) => {
      await this.lockAppointmentSchedule(transaction, data.userId);
      await this.ensureAppointmentSlotAvailable(transaction, data);

      return transaction.appointment.create({
        data,
        select: appointmentSelect,
      });
    });
  }

  public async cancelAppointment(
    data: AppointmentMutationData,
  ): Promise<AppointmentRecord> {
    return prisma.$transaction(async (transaction) => {
      await this.lockAppointmentSchedule(transaction, data.userId);

      return transaction.appointment.update({
        where: {
          id: data.appointmentId,
          userId: data.userId,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        data: { status: "CANCELLED" },
        select: appointmentSelect,
      });
    });
  }

  public async rescheduleAppointment(
    data: RescheduleAppointmentData,
  ): Promise<AppointmentRecord> {
    return prisma.$transaction(async (transaction) => {
      await this.lockAppointmentSchedule(transaction, data.userId);
      const appointment = await transaction.appointment.update({
        where: {
          id: data.appointmentId,
          userId: data.userId,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        data: { scheduledAt: data.scheduledAt },
        select: appointmentSelect,
      });

      await this.ensureAppointmentSlotAvailable(transaction, {
        userId: data.userId,
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes,
        excludeAppointmentId: data.appointmentId,
      });

      return appointment;
    });
  }

  public async lockAppointmentSchedule(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "users"
      WHERE "id" = ${userId}::uuid
      FOR UPDATE
    `;
  }

  public async ensureAppointmentSlotAvailable(
    transaction: Prisma.TransactionClient,
    data: AppointmentScheduleData,
  ): Promise<void> {
    const appointmentEndsAt = new Date(
      data.scheduledAt.getTime() +
        data.durationMinutes * APPOINTMENT_CONSTANTS.MILLISECONDS_PER_MINUTE,
    );
    const earliestPossibleExistingStart = new Date(
      data.scheduledAt.getTime() -
        APPOINTMENT_CONSTANTS.MAX_DURATION_MINUTES *
          APPOINTMENT_CONSTANTS.MILLISECONDS_PER_MINUTE,
    );
    const excludedAppointmentId = data.excludeAppointmentId ?? null;
    const [result] = await transaction.$queryRaw<
      AppointmentConflictQueryResult[]
    >`
      SELECT EXISTS (
        SELECT 1
        FROM "appointments"
        WHERE "user_id" = ${data.userId}::uuid
          AND "status" <> 'CANCELLED'
          AND (
            ${excludedAppointmentId}::uuid IS NULL
            OR "id" <> ${excludedAppointmentId}::uuid
          )
          AND "scheduled_at" > ${earliestPossibleExistingStart}
          AND "scheduled_at" < ${appointmentEndsAt}
          AND "scheduled_at" + "duration_minutes" * INTERVAL '1 minute'
            > ${data.scheduledAt}
      ) AS "hasConflict"
    `;

    if (result?.hasConflict) {
      throw new AppointmentSlotConflictError();
    }
  }

  public findAppointmentForUser(
    appointmentId: string,
    userId: string,
  ): Promise<AppointmentRecord | null> {
    return prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        userId,
      },
      select: appointmentSelect,
    });
  }

  public listAppointments(
    data: ListAppointmentsData,
  ): Promise<AppointmentRecord[]> {
    return prisma.appointment.findMany({
      where: {
        userId: data.userId,
        ...(data.status ? { status: data.status } : {}),
        ...(data.cursor
          ? {
              OR: [
                { createdAt: { lt: data.cursor.createdAt } },
                {
                  createdAt: data.cursor.createdAt,
                  id: { lt: data.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: data.take,
      select: appointmentSelect,
    });
  }
}

export const appointmentDal = new AppointmentDal();
