import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import {
  addTestMember,
  createTestBusiness,
  createTestService,
  getFirstLocationId,
} from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

describe("staff API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("creates staff with services, overrides and locations", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);
    const haircut = await createTestService(owner, business);
    const colour = await createTestService(owner, business, { name: "Colour" });
    const locationId = await getFirstLocationId(owner, business);

    const created = await request(app)
      .post(`/api/businesses/${business.id}/staff`)
      .set(...authHeader(owner))
      .send({
        displayName: "Sana Stylist",
        email: "Sana@Example.com",
        services: [
          { serviceId: haircut },
          { serviceId: colour, customDurationMinutes: 90, customPriceMinor: 6_000 },
        ],
        locationIds: [locationId],
      })
      .expect(201);

    expect(created.body).toMatchObject({
      displayName: "Sana Stylist",
      email: "sana@example.com",
      locations: [{ id: locationId }],
    });
    expect(created.body.services).toEqual([
      expect.objectContaining({ serviceName: "Colour", customDurationMinutes: 90 }),
      expect.objectContaining({ serviceName: "Haircut", customPriceMinor: null }),
    ]);

    const updated = await request(app)
      .patch(`/api/businesses/${business.id}/staff/${created.body.id}`)
      .set(...authHeader(owner))
      .send({ services: [{ serviceId: haircut }], bio: "Ten years of experience" })
      .expect(200);

    expect(updated.body.services).toHaveLength(1);
    expect(updated.body.locations).toHaveLength(1);
    expect(updated.body.bio).toBe("Ten years of experience");
  });

  it("links staff to a business member only once", async () => {
    const owner = await createTestUser();
    const stylist = await createTestUser();
    const outsider = await createTestUser();
    const business = await createTestBusiness(owner);
    await addTestMember(owner, business, stylist, "STAFF");

    await request(app)
      .post(`/api/businesses/${business.id}/staff`)
      .set(...authHeader(owner))
      .send({ displayName: "Linked Stylist", userId: stylist.id })
      .expect(201);

    const duplicate = await request(app)
      .post(`/api/businesses/${business.id}/staff`)
      .set(...authHeader(owner))
      .send({ displayName: "Linked Again", userId: stylist.id })
      .expect(409);

    expect(duplicate.body.error.code).toBe("STAFF_ALREADY_LINKED");

    const notMember = await request(app)
      .post(`/api/businesses/${business.id}/staff`)
      .set(...authHeader(owner))
      .send({ displayName: "Outsider", userId: outsider.id })
      .expect(422);

    expect(notMember.body.error.fieldErrors).toHaveProperty("userId");
  });

  it("rejects services and locations from another business", async () => {
    const ownerA = await createTestUser();
    const ownerB = await createTestUser();
    const businessA = await createTestBusiness(ownerA);
    const businessB = await createTestBusiness(ownerB, { name: "Other" });
    const foreignService = await createTestService(ownerB, businessB);
    const foreignLocation = await getFirstLocationId(ownerB, businessB);

    const serviceResponse = await request(app)
      .post(`/api/businesses/${businessA.id}/staff`)
      .set(...authHeader(ownerA))
      .send({ displayName: "Sneaky", services: [{ serviceId: foreignService }] })
      .expect(422);

    expect(serviceResponse.body.error.fieldErrors).toHaveProperty("services");

    await request(app)
      .post(`/api/businesses/${businessA.id}/staff`)
      .set(...authHeader(ownerA))
      .send({ displayName: "Sneaky", locationIds: [foreignLocation] })
      .expect(422);
  });

  it("validates avatar URLs", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);

    await request(app)
      .post(`/api/businesses/${business.id}/staff`)
      .set(...authHeader(owner))
      .send({ displayName: "Avatar", avatarUrl: "javascript:alert(1)" })
      .expect(422);
  });

  it("lists active staff publicly, filtered by service", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);
    const haircut = await createTestService(owner, business);
    const colour = await createTestService(owner, business, { name: "Colour" });

    for (const [displayName, serviceId] of [
      ["Ali Barber", haircut],
      ["Cara Colourist", colour],
    ] as const) {
      await request(app)
        .post(`/api/businesses/${business.id}/staff`)
        .set(...authHeader(owner))
        .send({ displayName, services: [{ serviceId }] })
        .expect(201);
    }

    const all = await request(app).get(`/api/public/${business.slug}/staff`).expect(200);

    expect(all.body.items).toHaveLength(2);
    expect(all.body.items[0]).not.toHaveProperty("email");

    const colourists = await request(app)
      .get(`/api/public/${business.slug}/staff`)
      .query({ serviceId: colour })
      .expect(200);

    expect(colourists.body.items.map((item: { displayName: string }) => item.displayName)).toEqual([
      "Cara Colourist",
    ]);
  });
});

describe("resources API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("creates a resource at a location and ties it to services", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);
    const massage = await createTestService(owner, business, { name: "Massage" });
    const locationId = await getFirstLocationId(owner, business);

    const created = await request(app)
      .post(`/api/businesses/${business.id}/resources`)
      .set(...authHeader(owner))
      .send({ name: "Treatment room 1", locationId, serviceIds: [massage] })
      .expect(201);

    expect(created.body).toMatchObject({
      name: "Treatment room 1",
      capacity: 1,
      location: { id: locationId },
      services: [{ id: massage, name: "Massage" }],
    });

    await request(app)
      .post(`/api/businesses/${business.id}/resources`)
      .set(...authHeader(owner))
      .send({ name: "Treatment room 1", locationId })
      .expect(409);

    const cleared = await request(app)
      .patch(`/api/businesses/${business.id}/resources/${created.body.id}`)
      .set(...authHeader(owner))
      .send({ serviceIds: [], isActive: false })
      .expect(200);

    expect(cleared.body).toMatchObject({ services: [], isActive: false });
  });

  it("forbids staff members from managing resources", async () => {
    const owner = await createTestUser();
    const staff = await createTestUser();
    const business = await createTestBusiness(owner);
    await addTestMember(owner, business, staff, "STAFF");
    const locationId = await getFirstLocationId(owner, business);

    await request(app)
      .post(`/api/businesses/${business.id}/resources`)
      .set(...authHeader(staff))
      .send({ name: "Chair", locationId })
      .expect(403);
  });
});
