import request from "supertest";

import { app } from "../../src/app.js";

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

let userSequence = 0;

export async function createTestUser(
  overrides: { email?: string; fullName?: string } = {},
): Promise<TestUser> {
  userSequence += 1;

  const response = await request(app)
    .post("/api/auth/signup")
    .send({
      fullName: overrides.fullName ?? `Test User ${userSequence}`,
      email: overrides.email ?? `user${userSequence}.${Date.now()}@example.com`,
      password: "Password123",
    })
    .expect(201);

  return {
    id: response.body.user.id,
    email: response.body.user.email,
    accessToken: response.body.accessToken,
  };
}

export function authHeader(user: TestUser): [string, string] {
  return ["Authorization", `Bearer ${user.accessToken}`];
}
