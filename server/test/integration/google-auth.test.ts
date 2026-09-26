import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import type { GoogleProfile } from "../../src/modules/auth/dto/auth.dto.js";
import {
  GoogleAuthService,
  type GoogleAuthorizationState,
} from "../../src/modules/auth/google-auth.service.js";
import type {
  GoogleCodeExchange,
  GoogleIdentityClient,
} from "../../src/modules/auth/google-identity.client.js";
import { createTestUser } from "../helpers/auth.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

class FakeGoogle implements GoogleIdentityClient {
  public exchanges: GoogleCodeExchange[] = [];

  public constructor(private readonly profile: GoogleProfile) {}

  public exchangeCode(exchange: GoogleCodeExchange): Promise<GoogleProfile> {
    this.exchanges.push(exchange);

    return Promise.resolve(this.profile);
  }
}

const STATE: GoogleAuthorizationState = { state: "state-1", nonce: "nonce-1", codeVerifier: "verifier-1" };

function profile(overrides: Partial<GoogleProfile> = {}): GoogleProfile {
  return {
    subject: "google-123",
    email: "person@example.com",
    emailVerified: true,
    fullName: "Google Person",
    ...overrides,
  };
}

function signIn(service: GoogleAuthService, state = STATE.state) {
  return service.completeSignIn({ code: "auth-code", state }, STATE, null);
}

describe("Google sign-in", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("creates a verified account and signs in again with the same Google identity", async () => {
    const google = new FakeGoogle(profile());
    const service = new GoogleAuthService(google);
    const first = await signIn(service);

    expect(first.response.user).toMatchObject({
      email: "person@example.com",
      fullName: "Google Person",
      emailVerified: true,
      hasPassword: false,
    });
    expect(google.exchanges[0]).toMatchObject({ code: "auth-code", nonce: "nonce-1", codeVerifier: "verifier-1" });

    const again = await signIn(service);

    expect(again.response.user.id).toBe(first.response.user.id);
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it("rejects a callback whose state does not match", async () => {
    await expect(signIn(new GoogleAuthService(new FakeGoogle(profile())), "forged")).rejects.toThrow(
      "OAuth state mismatch",
    );
  });

  it("links a verified Google email to an existing verified account and keeps its password", async () => {
    const existing = await createTestUser({ email: "person@example.com" });

    await prisma.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } });

    const session = await signIn(new GoogleAuthService(new FakeGoogle(profile())));

    expect(session.response.user).toMatchObject({ id: existing.id, hasPassword: true });
    await request(app)
      .post("/api/auth/sign-in")
      .send({ email: "person@example.com", password: "Password123" })
      .expect(200);
  });

  it("drops the password of an unverified account before linking it", async () => {
    const squatter = await createTestUser({ email: "person@example.com" });
    const session = await signIn(new GoogleAuthService(new FakeGoogle(profile())));

    expect(session.response.user).toMatchObject({ id: squatter.id, hasPassword: false, emailVerified: true });
    await request(app)
      .post("/api/auth/sign-in")
      .send({ email: "person@example.com", password: "Password123" })
      .expect(401);
  });

  it("refuses to link an email Google has not verified", async () => {
    await createTestUser({ email: "person@example.com" });

    await expect(
      signIn(new GoogleAuthService(new FakeGoogle(profile({ emailVerified: false })))),
    ).rejects.toThrow("cannot be linked");
  });

  it("needs a client id to build the consent URL", () => {
    const service = new GoogleAuthService(new FakeGoogle(profile()));

    // The shared env has no client id, so the URL cannot be built.
    expect(() => service.createAuthorization()).toThrow("Google sign-in is not available");
  });
});
