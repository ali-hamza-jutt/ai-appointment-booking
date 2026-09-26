import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

describe("appointments API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("creates, lists and cancels an appointment", async () => {
    const user = await createTestUser();

    const created = await request(app)
      .post("/api/appointments")
      .set(...authHeader(user))
      .send({
        serviceName: "Haircut",
        scheduledAt: futureIso(24),
        timeZone: "UTC",
      })
      .expect(201);

    const list = await request(app)
      .get("/api/appointments")
      .set(...authHeader(user))
      .expect(200);

    expect(list.body.items).toHaveLength(1);

    const cancelled = await request(app)
      .patch(`/api/appointments/${created.body.id}/cancel`)
      .set(...authHeader(user))
      .expect(200);

    expect(cancelled.body.status).toBe("CANCELLED");
  });

  it("returns 409 for an overlapping appointment", async () => {
    const user = await createTestUser();
    const body = { serviceName: "Haircut", scheduledAt: futureIso(24), timeZone: "UTC" };

    await request(app).post("/api/appointments").set(...authHeader(user)).send(body).expect(201);
    const conflict = await request(app)
      .post("/api/appointments")
      .set(...authHeader(user))
      .send(body)
      .expect(409);

    expect(conflict.body.error.code).toBe("APPOINTMENT_SLOT_UNAVAILABLE");
  });

  it("never exposes one user's appointment to another user", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();

    const created = await request(app)
      .post("/api/appointments")
      .set(...authHeader(owner))
      .send({ serviceName: "Haircut", scheduledAt: futureIso(24), timeZone: "UTC" })
      .expect(201);

    await request(app)
      .get(`/api/appointments/${created.body.id}`)
      .set(...authHeader(stranger))
      .expect(404);

    const strangerList = await request(app)
      .get("/api/appointments")
      .set(...authHeader(stranger))
      .expect(200);

    expect(strangerList.body.items).toHaveLength(0);
  });
});
