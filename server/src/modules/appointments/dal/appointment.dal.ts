import { prisma } from "../../../infrastructure/database/prisma.js";
import type {
  AppointmentRecord,
  CreateAppointmentData,
  ListAppointmentsData,
} from "../dto/appointment.dto.js";

export const appointmentSelect = {
  id: true,
  serviceName: true,
  scheduledAt: true,
  durationMinutes: true,
  status: true,
  source: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class AppointmentDal {
  public createAppointment(
    data: CreateAppointmentData,
  ): Promise<AppointmentRecord> {
    return prisma.appointment.create({
      data,
      select: appointmentSelect,
    });
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
                { scheduledAt: { gt: data.cursor.scheduledAt } },
                {
                  scheduledAt: data.cursor.scheduledAt,
                  id: { gt: data.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: data.take,
      select: appointmentSelect,
    });
  }
}

export const appointmentDal = new AppointmentDal();
