import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import { addTestMember, createTestBusiness } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

describe("customers API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("lets staff add customers and search them", async () => {
    const owner = await createTestUser();
    const staff = await createTestUser();
    const business = await createTestBusiness(owner);
    await addTestMember(owner, business, staff, "STAFF");

    await request(app)
      .post(`/api/businesses/${business.id}/customers`)
      .set(...authHeader(staff))
      .send({ name: "Ayesha Khan", email: "Ayesha@Example.com", phone: "+44 7700 900123" })
      .expect(201);
    await request(app)
      .post(`/api/businesses/${business.id}/customers`)
      .set(...authHeader(staff))
      .send({ name: "Bilal Ahmed" })
      .expect(201);

    const all = await request(app)
      .get(`/api/businesses/${business.id}/customers`)
      .set(...authHeader(staff))
      .expect(200);

    expect(all.body.items).toHaveLength(2);

    const search = await request(app)
      .get(`/api/businesses/${business.id}/customers`)
      .query({ search: "ayesha" })
      .set(...authHeader(staff))
      .expect(200);

    expect(search.body.items).toEqual([
      expect.objectContaining({ email: "ayesha@example.com", hasAccount: false }),
    ]);
  });

  it("paginates with a cursor", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);

    for (const name of ["Ann", "Ben", "Cat"]) {
      await request(app)
        .post(`/api/businesses/${business.id}/customers`)
        .set(...authHeader(owner))
        .send({ name: `${name} Customer` })
        .expect(201);
    }

    const first = await request(app)
      .get(`/api/businesses/${business.id}/customers`)
      .query({ limit: 2 })
      .set(...authHeader(owner))
      .expect(200);

    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await request(app)
      .get(`/api/businesses/${business.id}/customers`)
      .query({ limit: 2, cursor: first.body.nextCursor })
      .set(...authHeader(owner))
      .expect(200);

    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeUndefined();
  });

  it("rejects a duplicate customer email within a business", async () => {
    const owner = await createTestUser();
    const business = await createTestBusiness(owner);
    const body = { name: "Same Person", email: "same@example.com" };

    await request(app)
      .post(`/api/businesses/${business.id}/customers`)
      .set(...authHeader(owner))
      .send(body)
      .expect(201);

    const conflict = await request(app)
      .post(`/api/businesses/${business.id}/customers`)
      .set(...authHeader(owner))
      .send(body)
      .expect(409);

    expect(conflict.body.error.code).toBe("CUSTOMER_ALREADY_EXISTS");
  });

  it("never lists another business's customers", async () => {
    const ownerA = await createTestUser();
    const ownerB = await createTestUser();
    const businessA = await createTestBusiness(ownerA);
    const businessB = await createTestBusiness(ownerB, { name: "Other Clinic", vertical: "CLINIC" });

    await request(app)
      .post(`/api/businesses/${businessA.id}/customers`)
      .set(...authHeader(ownerA))
      .send({ name: "Private Customer" })
      .expect(201);

    await request(app)
      .get(`/api/businesses/${businessA.id}/customers`)
      .set(...authHeader(ownerB))
      .expect(404);

    const own = await request(app)
      .get(`/api/businesses/${businessB.id}/customers`)
      .set(...authHeader(ownerB))
      .expect(200);

    expect(own.body.items).toHaveLength(0);
  });
});
