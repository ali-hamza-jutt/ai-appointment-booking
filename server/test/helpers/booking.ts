import request from "supertest";

import { app } from "../../src/app.js";
import { authHeader, createTestUser, type TestUser } from "./auth.js";
import { createTestBusiness, createTestService, type TestBusiness } from "./business.js";
import { nextIsoWeekday } from "./dates.js";

export interface BookableSetup {
  owner: TestUser;
  business: TestBusiness;
  serviceId: string;
  staffId: string;
  /** A future Tuesday (UTC) on which the staff member works 09:00–17:00. */
  day: string;
  at: (time: string) => string;
}

/**
 * A UTC business with one service and one staff member working Tuesdays
 * 09:00–17:00, hourly slots and no minimum notice.
 */
export async function createBookableSetup(
  options: {
    service?: Record<string, unknown>;
    settings?: Record<string, unknown>;
  } = {},
): Promise<BookableSetup> {
  const owner = await createTestUser();
  const business = await createTestBusiness(owner, { timeZone: "UTC", currency: "USD" });

  await request(app)
    .patch(`/api/businesses/${business.id}/settings`)
    .set(...authHeader(owner))
    .send({ slotStepMinutes: 60, minimumNoticeMinutes: 0, ...options.settings })
    .expect(200);

  const serviceId = await createTestService(owner, business, {
    name: "Haircut",
    durationMinutes: 60,
    priceMinor: 3_000,
    ...options.service,
  });
  const staff = await request(app)
    .post(`/api/businesses/${business.id}/staff`)
    .set(...authHeader(owner))
    .send({ displayName: "Sana", services: [{ serviceId }] })
    .expect(201);

  await request(app)
    .put(`/api/businesses/${business.id}/staff/${staff.body.id}/working-hours`)
    .set(...authHeader(owner))
    .send({ items: [{ weekday: 2, startTime: "09:00", endTime: "17:00" }] })
    .expect(200);

  const day = nextIsoWeekday(2);

  return {
    owner,
    business,
    serviceId,
    staffId: staff.body.id,
    day,
    at: (time: string) => `${day}T${time}:00.000Z`,
  };
}

export function holdSlot(
  customer: TestUser,
  setup: BookableSetup,
  startsAt: string,
  extra: Record<string, unknown> = {},
) {
  return request(app)
    .post("/api/appointments/holds")
    .set(...authHeader(customer))
    .send({
      businessSlug: setup.business.slug,
      serviceId: setup.serviceId,
      startsAt,
      ...extra,
    });
}

export async function bookSlot(
  customer: TestUser,
  setup: BookableSetup,
  startsAt: string,
): Promise<string> {
  const hold = await holdSlot(customer, setup, startsAt).expect(201);

  await request(app)
    .post(`/api/appointments/${hold.body.id}/confirm`)
    .set(...authHeader(customer))
    .expect(200);

  return hold.body.id;
}
