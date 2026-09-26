import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import { addTestMember, createTestBusiness } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

describe("businesses API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("lists the supported verticals without authentication", async () => {
    const response = await request(app).get("/api/business-verticals").expect(200);

    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      "SALON",
      "CLINIC",
      "CONSULTANT",
      "SPA_WELLNESS",
      "FITNESS_STUDIO",
      "TUTORING",
      "PET_GROOMING",
    ]);
  });

  it("creates a business owned by the caller with a default location", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);

    expect(business.slug).toBe("glow-salon");

    const detail = await request(app)
      .get(`/api/businesses/${business.id}`)
      .set(...authHeader(owner))
      .expect(200);

    expect(detail.body).toMatchObject({
      role: "OWNER",
      currency: "GBP",
      settings: { slotStepMinutes: 15 },
    });

    const locations = await request(app)
      .get(`/api/businesses/${business.id}/locations`)
      .set(...authHeader(owner))
      .expect(200);

    expect(locations.body.items).toHaveLength(1);
    expect(locations.body.items[0].timeZone).toBe("Europe/London");

    const mine = await request(app)
      .get("/api/businesses")
      .set(...authHeader(owner))
      .expect(200);

    expect(mine.body.items).toEqual([
      expect.objectContaining({ id: business.id, role: "OWNER" }),
    ]);
  });

  it("suffixes a generated slug on collision but rejects a taken explicit slug", async () => {
    const owner = await createTestUser();
    await createTestBusiness(owner);
    const second = await createTestBusiness(owner);

    expect(second.slug).toMatch(/^glow-salon-[a-f0-9]{4}$/);

    const conflict = await request(app)
      .post("/api/businesses")
      .set(...authHeader(owner))
      .send({ name: "Other", vertical: "CLINIC", timeZone: "UTC", slug: "glow-salon" })
      .expect(409);

    expect(conflict.body.error.code).toBe("BUSINESS_SLUG_TAKEN");
  });

  it("validates time zone and currency", async () => {
    const owner = await createTestUser();

    const response = await request(app)
      .post("/api/businesses")
      .set(...authHeader(owner))
      .send({ name: "Clinic", vertical: "CLINIC", timeZone: "Mars/Base", currency: "ZZZ" })
      .expect(422);

    expect(response.body.error.fieldErrors).toHaveProperty("timeZone");
  });

  it("hides a business from non-members", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const business = await createTestBusiness(owner);

    const response = await request(app)
      .get(`/api/businesses/${business.id}`)
      .set(...authHeader(stranger))
      .expect(404);

    expect(response.body.error.code).toBe("BUSINESS_NOT_FOUND");

    await request(app)
      .patch(`/api/businesses/${business.id}/settings`)
      .set(...authHeader(stranger))
      .send({ slotStepMinutes: 30 })
      .expect(404);
  });

  it("lets staff read but not manage the business", async () => {
    const owner = await createTestUser();
    const staff = await createTestUser();
    const business = await createTestBusiness(owner);
    await addTestMember(owner, business, staff, "STAFF");

    const detail = await request(app)
      .get(`/api/businesses/${business.id}`)
      .set(...authHeader(staff))
      .expect(200);

    expect(detail.body.role).toBe("STAFF");

    const forbidden = await request(app)
      .patch(`/api/businesses/${business.id}/settings`)
      .set(...authHeader(staff))
      .send({ slotStepMinutes: 30 })
      .expect(403);

    expect(forbidden.body.error.code).toBe("INSUFFICIENT_SCOPE");
  });

  it("updates settings partially and validates ranges", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);

    const updated = await request(app)
      .patch(`/api/businesses/${business.id}/settings`)
      .set(...authHeader(owner))
      .send({ slotStepMinutes: 30, allowGuestBooking: false })
      .expect(200);

    expect(updated.body.settings).toMatchObject({
      slotStepMinutes: 30,
      allowGuestBooking: false,
      bookingWindowDays: 60,
    });

    await request(app)
      .patch(`/api/businesses/${business.id}/settings`)
      .set(...authHeader(owner))
      .send({ holdMinutes: 500 })
      .expect(422);
  });

  it("adds, updates and deactivates locations", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);

    const created = await request(app)
      .post(`/api/businesses/${business.id}/locations`)
      .set(...authHeader(owner))
      .send({ name: "Downtown", address: "1 High Street" })
      .expect(201);

    expect(created.body.timeZone).toBe("Europe/London");

    const updated = await request(app)
      .patch(`/api/businesses/${business.id}/locations/${created.body.id}`)
      .set(...authHeader(owner))
      .send({ isActive: false })
      .expect(200);

    expect(updated.body.isActive).toBe(false);
  });
});

describe("team API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("adds an existing user immediately and invites an unknown email", async () => {
    const owner = await createTestUser();
    const existing = await createTestUser();
    const business = await createTestBusiness(owner);

    await addTestMember(owner, business, existing, "MANAGER");

    const invited = await request(app)
      .post(`/api/businesses/${business.id}/members`)
      .set(...authHeader(owner))
      .send({ email: "New.Person@example.com", role: "STAFF" })
      .expect(201);

    expect(invited.body.invitation).toMatchObject({
      email: "new.person@example.com",
      role: "STAFF",
    });

    const team = await request(app)
      .get(`/api/businesses/${business.id}/members`)
      .set(...authHeader(owner))
      .expect(200);

    expect(team.body.members).toHaveLength(2);
    expect(team.body.invitations).toHaveLength(1);
  });

  it("turns an invitation into a membership when the email signs up", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);

    await request(app)
      .post(`/api/businesses/${business.id}/members`)
      .set(...authHeader(owner))
      .send({ email: "joiner@example.com", role: "STAFF" })
      .expect(201);

    const joiner = await createTestUser({ email: "joiner@example.com" });
    const mine = await request(app)
      .get("/api/businesses")
      .set(...authHeader(joiner))
      .expect(200);

    expect(mine.body.items).toEqual([
      expect.objectContaining({ id: business.id, role: "STAFF" }),
    ]);
  });

  it("rejects a duplicate membership", async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const business = await createTestBusiness(owner);
    await addTestMember(owner, business, member, "STAFF");

    const response = await request(app)
      .post(`/api/businesses/${business.id}/members`)
      .set(...authHeader(owner))
      .send({ email: member.email, role: "STAFF" })
      .expect(409);

    expect(response.body.error.code).toBe("MEMBER_ALREADY_EXISTS");
  });

  it("protects the owner and restricts role changes to the owner", async () => {
    const owner = await createTestUser();
    const manager = await createTestUser();
    const staff = await createTestUser();
    const business = await createTestBusiness(owner);
    await addTestMember(owner, business, manager, "MANAGER");
    const staffMembershipId = await addTestMember(owner, business, staff, "STAFF");

    const team = await request(app)
      .get(`/api/businesses/${business.id}/members`)
      .set(...authHeader(owner))
      .expect(200);
    const ownerMembership = team.body.members.find(
      (member: { role: string }) => member.role === "OWNER",
    );

    const removeOwner = await request(app)
      .delete(`/api/businesses/${business.id}/members/${ownerMembership.id}`)
      .set(...authHeader(manager))
      .expect(409);

    expect(removeOwner.body.error.code).toBe("MEMBER_CHANGE_NOT_ALLOWED");

    await request(app)
      .patch(`/api/businesses/${business.id}/members/${staffMembershipId}`)
      .set(...authHeader(manager))
      .send({ role: "MANAGER" })
      .expect(403);

    const promoted = await request(app)
      .patch(`/api/businesses/${business.id}/members/${staffMembershipId}`)
      .set(...authHeader(owner))
      .send({ role: "MANAGER" })
      .expect(200);

    expect(promoted.body.role).toBe("MANAGER");

    await request(app)
      .delete(`/api/businesses/${business.id}/members/${staffMembershipId}`)
      .set(...authHeader(manager))
      .expect(204);
  });
});
