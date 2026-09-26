import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import {
  addTestMember,
  createTestBusiness,
  createTestService,
  type TestBusiness,
} from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { addDays, nextIsoWeekday } from "../helpers/dates.js";

async function createStaff(
  owner: TestUser,
  business: TestBusiness,
  serviceIds: string[],
  displayName = "Sana Stylist",
): Promise<string> {
  const response = await request(app)
    .post(`/api/businesses/${business.id}/staff`)
    .set(...authHeader(owner))
    .send({ displayName, services: serviceIds.map((serviceId) => ({ serviceId })) })
    .expect(201);

  return response.body.id;
}

function setHours(
  owner: TestUser,
  business: TestBusiness,
  staffId: string,
  items: Array<Record<string, unknown>>,
) {
  return request(app)
    .put(`/api/businesses/${business.id}/staff/${staffId}/working-hours`)
    .set(...authHeader(owner))
    .send({ items });
}

describe("staff schedules API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("replaces weekly hours, including split and overnight shifts", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);
    const staffId = await createStaff(owner, business, []);

    const saved = await setHours(owner, business, staffId, [
      { weekday: 1, startTime: "09:00", endTime: "13:00" },
      { weekday: 1, startTime: "14:00", endTime: "18:00" },
      { weekday: 5, startTime: "20:00", endTime: "02:00" },
    ]).expect(200);

    expect(saved.body.items).toEqual([
      expect.objectContaining({ weekday: 1, startTime: "09:00", endTime: "13:00", endsNextDay: false }),
      expect.objectContaining({ weekday: 1, startTime: "14:00", endTime: "18:00" }),
      expect.objectContaining({ weekday: 5, startTime: "20:00", endTime: "02:00", endsNextDay: true }),
    ]);

    const listed = await request(app)
      .get(`/api/businesses/${business.id}/staff/${staffId}/working-hours`)
      .set(...authHeader(owner))
      .expect(200);

    expect(listed.body.items).toHaveLength(3);
  });

  it.each([
    ["same-day overlap", [
      { weekday: 2, startTime: "09:00", endTime: "12:00" },
      { weekday: 2, startTime: "11:00", endTime: "15:00" },
    ]],
    ["overnight shift running into the next morning", [
      { weekday: 3, startTime: "22:00", endTime: "03:00" },
      { weekday: 4, startTime: "02:00", endTime: "06:00" },
    ]],
    ["Sunday night wrapping into Monday", [
      { weekday: 7, startTime: "23:00", endTime: "02:00" },
      { weekday: 1, startTime: "01:00", endTime: "05:00" },
    ]],
  ])("rejects %s", async (_label, items) => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);
    const staffId = await createStaff(owner, business, []);

    const response = await setHours(owner, business, staffId, items).expect(422);

    expect(response.body.error.fieldErrors).toHaveProperty("items");
  });

  it("adds and removes time off and closures", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);
    const staffId = await createStaff(owner, business, []);
    const day = nextIsoWeekday(3);

    const timeOff = await request(app)
      .post(`/api/businesses/${business.id}/staff/${staffId}/time-off`)
      .set(...authHeader(owner))
      .send({ startsAt: `${day}T09:00:00Z`, endsAt: `${day}T17:00:00Z`, reason: "Training" })
      .expect(201);

    await request(app)
      .post(`/api/businesses/${business.id}/staff/${staffId}/time-off`)
      .set(...authHeader(owner))
      .send({ startsAt: `${day}T17:00:00Z`, endsAt: `${day}T09:00:00Z` })
      .expect(422);

    await request(app)
      .delete(`/api/businesses/${business.id}/staff/${staffId}/time-off/${timeOff.body.id}`)
      .set(...authHeader(owner))
      .expect(204);

    const closure = await request(app)
      .post(`/api/businesses/${business.id}/closures`)
      .set(...authHeader(owner))
      .send({ date: day, reason: "Public holiday" })
      .expect(201);

    expect(closure.body).toMatchObject({ date: day, reason: "Public holiday" });

    await request(app)
      .post(`/api/businesses/${business.id}/closures`)
      .set(...authHeader(owner))
      .send({ date: day })
      .expect(409);

    await request(app)
      .post(`/api/businesses/${business.id}/closures`)
      .set(...authHeader(owner))
      .send({ date: "2026-02-30" })
      .expect(422);
  });

  it("lets staff view but not change schedules", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const business = await createTestBusiness(owner);
    await addTestMember(owner, business, member, "STAFF");
    const staffId = await createStaff(owner, business, []);

    await request(app)
      .get(`/api/businesses/${business.id}/staff/${staffId}/working-hours`)
      .set(...authHeader(member))
      .expect(200);
    await setHours(member, business, staffId, []).expect(403);
  });
});

describe("public availability API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  async function setupSalon() {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner, { timeZone: "UTC" });

    await request(app)
      .patch(`/api/businesses/${business.id}/settings`)
      .set(...authHeader(owner))
      .send({ slotStepMinutes: 60, minimumNoticeMinutes: 0 })
      .expect(200);

    const serviceId = await createTestService(owner, business, { durationMinutes: 60 });
    const sana = await createStaff(owner, business, [serviceId], "Sana");
    const omar = await createStaff(owner, business, [serviceId], "Omar");
    const tuesday = nextIsoWeekday(2);

    await setHours(owner, business, sana, [
      { weekday: 2, startTime: "09:00", endTime: "12:00" },
    ]).expect(200);
    await setHours(owner, business, omar, [
      { weekday: 2, startTime: "11:00", endTime: "13:00" },
    ]).expect(200);

    return { owner, business, serviceId, sana, omar, tuesday };
  }

  it("returns slots grouped by date with the providers for each", async () => {
    const { business, serviceId, sana, omar, tuesday } = await setupSalon();

    const response = await request(app)
      .get(`/api/public/${business.slug}/availability`)
      .query({ serviceId, from: tuesday, to: tuesday })
      .expect(200);

    expect(response.body.timeZone).toBe("UTC");
    expect(response.body.days).toHaveLength(1);
    expect(
      response.body.days[0].slots.map((slot: { time: string; staffIds: string[] }) => [
        slot.time,
        [...slot.staffIds].sort(),
      ]),
    ).toEqual([
      ["09:00", [sana]],
      ["10:00", [sana]],
      ["11:00", [sana, omar].sort()],
      ["12:00", [omar]],
    ]);

    const onlyOmar = await request(app)
      .get(`/api/public/${business.slug}/availability`)
      .query({ serviceId, staffId: omar, from: tuesday, to: tuesday })
      .expect(200);

    expect(onlyOmar.body.days[0].slots.map((slot: { time: string }) => slot.time)).toEqual([
      "11:00",
      "12:00",
    ]);
  });

  it("converts to the viewer's time zone", async () => {
    const { business, serviceId, tuesday } = await setupSalon();

    const response = await request(app)
      .get(`/api/public/${business.slug}/availability`)
      .query({ serviceId, from: tuesday, to: tuesday, tz: "Asia/Karachi" })
      .expect(200);

    expect(response.body.days[0].slots[0].time).toBe("14:00");
  });

  it("drops closed days and time off", async () => {
    const { owner, business, serviceId, sana, tuesday } = await setupSalon();

    await request(app)
      .post(`/api/businesses/${business.id}/staff/${sana}/time-off`)
      .set(...authHeader(owner))
      .send({ startsAt: `${tuesday}T09:00:00Z`, endsAt: `${tuesday}T11:00:00Z` })
      .expect(201);

    const afterTimeOff = await request(app)
      .get(`/api/public/${business.slug}/availability`)
      .query({ serviceId, staffId: sana, from: tuesday, to: tuesday })
      .expect(200);

    expect(afterTimeOff.body.days[0].slots.map((slot: { time: string }) => slot.time)).toEqual([
      "11:00",
    ]);

    await request(app)
      .post(`/api/businesses/${business.id}/closures`)
      .set(...authHeader(owner))
      .send({ date: tuesday })
      .expect(201);

    const closed = await request(app)
      .get(`/api/public/${business.slug}/availability`)
      .query({ serviceId, from: tuesday, to: addDays(tuesday, 1) })
      .expect(200);

    expect(closed.body.days).toEqual([]);
  });

  it.each([
    ["an inverted range", (day: string) => ({ from: addDays(day, 1), to: day })],
    ["a range over 31 days", (day: string) => ({ from: day, to: addDays(day, 40) })],
    ["a malformed date", () => ({ from: "tomorrow", to: "later" })],
  ])("rejects %s", async (_label, range) => {
    const { business, serviceId, tuesday } = await setupSalon();

    await request(app)
      .get(`/api/public/${business.slug}/availability`)
      .query({ serviceId, ...range(tuesday) })
      .expect(422);
  });

  it("hides services that are not bookable online", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);
    const serviceId = await createTestService(owner, business, { onlineBookable: false });
    const day = nextIsoWeekday(2);

    await request(app)
      .get(`/api/public/${business.slug}/availability`)
      .query({ serviceId, from: day, to: day })
      .expect(404);
  });
});
