import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

describe("authentication API", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("signs up, signs in and returns the current user", async () => {
    const user = await createTestUser({ email: "owner@example.com" });

    const signIn = await request(app)
      .post("/api/auth/sign-in")
      .send({ email: "owner@example.com", password: "Password123" })
      .expect(200);

    expect(signIn.body.tokenType).toBe("Bearer");

    const me = await request(app)
      .get("/api/auth/me")
      .set(...authHeader(user))
      .expect(200);

    expect(me.body).toMatchObject({ id: user.id, email: "owner@example.com" });
  });

  it("rejects duplicate email registration", async () => {
    await createTestUser({ email: "dup@example.com" });

    const response = await request(app)
      .post("/api/auth/signup")
      .send({ fullName: "Dup", email: "dup@example.com", password: "Password123" })
      .expect(409);

    expect(response.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("rejects requests without a token", async () => {
    const response = await request(app).get("/api/auth/me").expect(401);

    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });
});
