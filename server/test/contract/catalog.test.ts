import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import {
  addTestMember,
  createTestBusiness,
  type TestBusiness,
} from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

function createService(
  owner: TestUser,
  business: TestBusiness,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(`/api/businesses/${business.id}/services`)
    .set(...authHeader(owner))
    .send({ durationMinutes: 30, priceMinor: 2_500, ...body });
}

describe("catalog API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("creates categories and services priced in the business currency", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);

    const category = await request(app)
      .post(`/api/businesses/${business.id}/service-categories`)
      .set(...authHeader(owner))
      .send({ name: "Hair" })
      .expect(201);

    const service = await createService(owner, business, {
      name: "Haircut – Men",
      categoryId: category.body.id,
      bufferAfterMin: 10,
      depositMinor: 500,
    }).expect(201);

    expect(service.body).toMatchObject({
      name: "Haircut – Men",
      currency: "GBP",
      bookingType: "APPOINTMENT",
      capacity: 1,
      category: { id: category.body.id, name: "Hair" },
      bufferAfterMin: 10,
    });

    const list = await request(app)
      .get(`/api/businesses/${business.id}/services`)
      .set(...authHeader(owner))
      .expect(200);

    expect(list.body.items).toHaveLength(1);
  });

  it("supports class services with seat capacity", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner, {
      name: "Flow Yoga",
      vertical: "FITNESS_STUDIO",
    });

    const yoga = await createService(owner, business, {
      name: "Morning yoga",
      bookingType: "CLASS",
      capacity: 12,
      durationMinutes: 60,
    }).expect(201);

    expect(yoga.body).toMatchObject({ bookingType: "CLASS", capacity: 12 });

    const invalid = await createService(owner, business, {
      name: "Private session",
      bookingType: "APPOINTMENT",
      capacity: 3,
    }).expect(422);

    expect(invalid.body.error.fieldErrors).toHaveProperty("capacity");

    const converted = await request(app)
      .patch(`/api/businesses/${business.id}/services/${yoga.body.id}`)
      .set(...authHeader(owner))
      .send({ bookingType: "APPOINTMENT" })
      .expect(200);

    expect(converted.body.capacity).toBe(1);
  });

  it("validates deposits against the price", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);

    const response = await createService(owner, business, {
      name: "Colour",
      priceMinor: 1_000,
      depositMinor: 2_000,
    }).expect(422);

    expect(response.body.error.fieldErrors).toHaveProperty("depositMinor");
  });

  it("rejects another business's category or location", async () => {
    const ownerA = await createTestUser();
    const ownerB = await createTestUser();
    const businessA = await createTestBusiness(ownerA);
    const businessB = await createTestBusiness(ownerB, { name: "Other" });

    const foreignCategory = await request(app)
      .post(`/api/businesses/${businessB.id}/service-categories`)
      .set(...authHeader(ownerB))
      .send({ name: "Theirs" })
      .expect(201);
    const foreignLocations = await request(app)
      .get(`/api/businesses/${businessB.id}/locations`)
      .set(...authHeader(ownerB))
      .expect(200);

    const categoryResponse = await createService(ownerA, businessA, {
      name: "Haircut",
      categoryId: foreignCategory.body.id,
    }).expect(404);

    expect(categoryResponse.body.error.code).toBe("SERVICE_CATEGORY_NOT_FOUND");

    const locationResponse = await createService(ownerA, businessA, {
      name: "Haircut",
      locationId: foreignLocations.body.items[0].id,
    }).expect(404);

    expect(locationResponse.body.error.code).toBe("LOCATION_NOT_FOUND");
  });

  it("lets staff read but not change the catalog", async () => {
    const owner = await createTestUser();
    const staff = await createTestUser();
    const business = await createTestBusiness(owner);
    await addTestMember(owner, business, staff, "STAFF");

    await request(app)
      .get(`/api/businesses/${business.id}/services`)
      .set(...authHeader(staff))
      .expect(200);
    await createService(staff, business, { name: "Haircut" }).expect(403);
  });

  it("rejects duplicate category names and uncategorizes services on delete", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);
    const category = await request(app)
      .post(`/api/businesses/${business.id}/service-categories`)
      .set(...authHeader(owner))
      .send({ name: "Nails" })
      .expect(201);

    await request(app)
      .post(`/api/businesses/${business.id}/service-categories`)
      .set(...authHeader(owner))
      .send({ name: "Nails" })
      .expect(409);

    const service = await createService(owner, business, {
      name: "Manicure",
      categoryId: category.body.id,
    }).expect(201);

    await request(app)
      .delete(`/api/businesses/${business.id}/service-categories/${category.body.id}`)
      .set(...authHeader(owner))
      .expect(204);

    const after = await request(app)
      .get(`/api/businesses/${business.id}/services/${service.body.id}`)
      .set(...authHeader(owner))
      .expect(200);

    expect(after.body.category).toBeNull();
  });
});

describe("public catalog API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("exposes only active, online-bookable services without authentication", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);

    await createService(owner, business, { name: "Haircut – Men" }).expect(201);
    await createService(owner, business, { name: "Phone-only consult", onlineBookable: false }).expect(201);
    const archived = await createService(owner, business, { name: "Old service" }).expect(201);

    await request(app)
      .patch(`/api/businesses/${business.id}/services/${archived.body.id}`)
      .set(...authHeader(owner))
      .send({ isActive: false })
      .expect(200);

    const profile = await request(app).get(`/api/public/${business.slug}`).expect(200);

    expect(profile.body).toMatchObject({ name: "Glow Salon", allowGuestBooking: true });

    const services = await request(app)
      .get(`/api/public/${business.slug}/services`)
      .expect(200);

    expect(services.body.items.map((item: { name: string }) => item.name)).toEqual([
      "Haircut – Men",
    ]);
  });

  it("fuzzy-matches service names for search", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);

    for (const name of ["Haircut – Men", "Haircut – Women", "Beard trim", "Hair colour"]) {
      await createService(owner, business, { name }).expect(201);
    }

    const results = await request(app)
      .get(`/api/public/${business.slug}/services`)
      .query({ search: "hair cut" })
      .expect(200);
    const names = results.body.items.map((item: { name: string }) => item.name);

    expect(names.slice(0, 2).sort()).toEqual(["Haircut – Men", "Haircut – Women"]);
    expect(names).not.toContain("Beard trim");

    const wildcard = await request(app)
      .get(`/api/public/${business.slug}/services`)
      .query({ search: "%" })
      .expect(200);

    expect(wildcard.body.items).toHaveLength(0);
  });

  it("returns 404 for an unknown booking link", async () => {
    await request(app).get("/api/public/no-such-business/services").expect(404);
  });
});
