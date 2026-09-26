import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { BUSINESS_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { AppointmentSlotConflictError } from "../../src/modules/appointments/appointment-slot-conflict.error.js";
import { appointmentDal } from "../../src/modules/appointments/dal/appointment.dal.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

async function createUser(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `dal.${Date.now()}.${Math.random()}@example.com`,
      fullName: "DAL User",
      passwordHash: "hash",
    },
    select: { id: true },
  });

  return user.id;
}

function appointmentAt(userId: string, scheduledAt: Date) {
  return {
    businessId: BUSINESS_CONSTANTS.DEMO_BUSINESS_ID,
    userId,
    scheduledAt,
    durationMinutes: 60,
    serviceName: "Consultation",
    timeZone: "UTC",
    source: "FORM" as const,
    notes: null,
  };
}

describe("appointment conflict guard", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("allows exactly one of many concurrent overlapping inserts", async () => {
    const userId = await createUser();
    const scheduledAt = new Date(Date.now() + 86_400_000);
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        appointmentDal.createAppointment(
          appointmentAt(userId, new Date(scheduledAt.getTime() + index * 60_000)),
        ),
      ),
    );

    const fulfilled = attempts.filter((result) => result.status === "fulfilled");
    const rejected = attempts.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(
      rejected.every(
        (result) => result.reason instanceof AppointmentSlotConflictError,
      ),
    ).toBe(true);
  });

  it("allows back-to-back appointments that only touch", async () => {
    const userId = await createUser();
    const firstStart = new Date(Date.now() + 86_400_000);

    await appointmentDal.createAppointment(appointmentAt(userId, firstStart));
    await expect(
      appointmentDal.createAppointment(
        appointmentAt(userId, new Date(firstStart.getTime() + 3_600_000)),
      ),
    ).resolves.toMatchObject({ status: "PENDING" });
  });
});
