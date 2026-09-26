import request from "supertest";

import { app } from "../../src/app.js";
import { authHeader, type TestUser } from "./auth.js";

export interface TestBusiness {
  id: string;
  slug: string;
}

export async function createTestBusiness(
  owner: TestUser,
  overrides: Record<string, unknown> = {},
): Promise<TestBusiness> {
  const response = await request(app)
    .post("/api/businesses")
    .set(...authHeader(owner))
    .send({
      name: "Glow Salon",
      vertical: "SALON",
      timeZone: "Europe/London",
      currency: "GBP",
      ...overrides,
    })
    .expect(201);

  return { id: response.body.id, slug: response.body.slug };
}

export async function addTestMember(
  owner: TestUser,
  business: TestBusiness,
  member: TestUser,
  role: "MANAGER" | "STAFF",
): Promise<string> {
  const response = await request(app)
    .post(`/api/businesses/${business.id}/members`)
    .set(...authHeader(owner))
    .send({ email: member.email, role })
    .expect(201);

  return response.body.member.id;
}

export async function createTestService(
  owner: TestUser,
  business: TestBusiness,
  body: Record<string, unknown> = {},
): Promise<string> {
  const response = await request(app)
    .post(`/api/businesses/${business.id}/services`)
    .set(...authHeader(owner))
    .send({ name: "Haircut", durationMinutes: 30, priceMinor: 2_500, ...body })
    .expect(201);

  return response.body.id;
}

export async function getFirstLocationId(
  owner: TestUser,
  business: TestBusiness,
): Promise<string> {
  const response = await request(app)
    .get(`/api/businesses/${business.id}/locations`)
    .set(...authHeader(owner))
    .expect(200);

  return response.body.items[0].id;
}
