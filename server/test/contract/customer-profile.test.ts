import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { customerProfileService } from "../../src/modules/customers/customer-profile.service.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup } from "../helpers/booking.js";
import { createTestBusiness } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

describe("customer profile API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("shows customers what each business remembers and lets them remove it", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const stranger = await createTestUser();

    await customerProfileService.rememberPreference(setup.business.id, customer.id, "USUAL_SERVICE", setup.serviceId);
    await customerProfileService.rememberPreference(setup.business.id, customer.id, "PREFERRED_STAFF", setup.staffId);

    const listed = await request(app).get("/api/me/preferences").set(...authHeader(customer)).expect(200);

    expect(listed.body.items).toEqual([
      {
        business: { id: setup.business.id, name: "Glow Salon", slug: setup.business.slug },
        preferences: [
          expect.objectContaining({ key: "PREFERRED_STAFF", value: setup.staffId, label: "Sana", source: "CUSTOMER" }),
          expect.objectContaining({ key: "USUAL_SERVICE", value: setup.serviceId, label: "Haircut", source: "CUSTOMER" }),
        ],
      },
    ]);

    const staffPreference = listed.body.items[0].preferences[0].id as string;

    await request(app).get("/api/me/preferences").set(...authHeader(stranger)).expect(200, { items: [] });
    await request(app).delete(`/api/me/preferences/${staffPreference}`).set(...authHeader(stranger)).expect(404);
    await request(app).delete("/api/me/preferences/not-a-uuid").set(...authHeader(customer)).expect(404);
    await request(app).delete(`/api/me/preferences/${staffPreference}`).set(...authHeader(customer)).expect(204);

    const after = await request(app).get("/api/me/preferences").set(...authHeader(customer)).expect(200);

    expect(after.body.items[0].preferences).toEqual([expect.objectContaining({ key: "USUAL_SERVICE" })]);
  });

  it("hides a preference whose provider is no longer active", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();

    await customerProfileService.rememberPreference(setup.business.id, customer.id, "PREFERRED_STAFF", setup.staffId);
    await prisma.staff.update({
      where: { id: setup.staffId, businessId: setup.business.id },
      data: { isActive: false },
    });

    await request(app).get("/api/me/preferences").set(...authHeader(customer)).expect(200, { items: [] });
    await expect(customerProfileService.getAgentProfile(setup.business.id, customer.id)).resolves.toMatchObject({
      preferences: [],
    });
  });

  it("gives staff a customer's profile and keeps it inside the business", async () => {
    const setup = await createBookableSetup();
    const customer = await createTestUser();
    const otherOwner = await createTestUser();
    const otherBusiness = await createTestBusiness(otherOwner, { name: "Other Studio" });

    await bookSlot(customer, setup, setup.at("10:00"));
    await customerProfileService.rememberPreference(setup.business.id, customer.id, "PREFERRED_PART_OF_DAY", "morning");

    const customers = await request(app)
      .get(`/api/businesses/${setup.business.id}/customers`)
      .set(...authHeader(setup.owner))
      .expect(200);
    const customerId = customers.body.items[0].id as string;

    const profile = await request(app)
      .get(`/api/businesses/${setup.business.id}/customers/${customerId}/profile`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(profile.body).toMatchObject({
      customer: { id: customerId, hasAccount: true },
      preferences: [{ key: "PREFERRED_PART_OF_DAY", value: "morning", label: "Mornings", source: "CUSTOMER" }],
      completedVisits: 0,
      noShows: 0,
      recentBookings: [{ serviceName: "Haircut", staffName: "Sana", status: "CONFIRMED" }],
    });

    await request(app)
      .get(`/api/businesses/${setup.business.id}/customers/${customerId}/profile`)
      .set(...authHeader(otherOwner))
      .expect(404);
    await request(app)
      .get(`/api/businesses/${otherBusiness.id}/customers/${customerId}/profile`)
      .set(...authHeader(otherOwner))
      .expect(404);
  });
});
