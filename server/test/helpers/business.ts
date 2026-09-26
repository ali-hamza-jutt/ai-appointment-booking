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
