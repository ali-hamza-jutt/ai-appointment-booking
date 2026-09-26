import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";
import { AUTH_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { mailer } from "../../src/infrastructure/messaging/mailer.js";
import { smsSender } from "../../src/infrastructure/messaging/sms-sender.js";
import { authHeader, createTestUser } from "../helpers/auth.js";
import { cookieHeader, cookieValue, setCookieLine } from "../helpers/cookies.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

const COOKIE = AUTH_CONSTANTS.REFRESH_COOKIE_NAME;
const PASSWORD = "Password123";

function signIn(email: string, password = PASSWORD, extra: Record<string, unknown> = {}) {
  return request(app).post("/api/auth/sign-in").send({ email, password, ...extra });
}

function refresh(token: string) {
  return request(app).post("/api/auth/refresh").set(...cookieHeader(COOKIE, token));
}

/** Pulls the `token` query parameter from the last email sent. */
function lastEmailToken(send: ReturnType<typeof vi.spyOn>): string {
  const message = send.mock.calls.at(-1)?.[0] as { text: string } | undefined;
  const token = message?.text.match(/token=([\w-]+)/)?.[1];

  if (!token) throw new Error("No emailed token found");

  return token;
}

function lastSmsCode(send: ReturnType<typeof vi.spyOn>): string {
  const message = send.mock.calls.at(-1)?.[0] as { text: string } | undefined;
  const code = message?.text.match(/^(\d{6})/)?.[1];

  if (!code) throw new Error("No texted code found");

  return code;
}

describe("sessions and refresh tokens", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectTestDatabase);

  it("sets an httpOnly refresh cookie scoped to the auth routes", async () => {
    await createTestUser({ email: "cookie@example.com" });

    const remembered = await signIn("cookie@example.com").expect(200);
    const line = setCookieLine(remembered, COOKIE) ?? "";

    expect(line).toMatch(/HttpOnly/);
    expect(line).toMatch(/SameSite=Lax/);
    expect(line).toMatch(/Path=\/api\/auth/);
    expect(line).toMatch(/Expires=/);

    const browserSession = await signIn("cookie@example.com", PASSWORD, { rememberMe: false }).expect(200);

    expect(setCookieLine(browserSession, COOKIE)).not.toMatch(/Expires=/);
  });

  it("rotates the refresh token and issues a working access token", async () => {
    await createTestUser({ email: "rotate@example.com" });

    const first = cookieValue(await signIn("rotate@example.com").expect(200), COOKIE) ?? "";
    const refreshed = await refresh(first).expect(200);
    const second = cookieValue(refreshed, COOKIE) ?? "";

    expect(second).not.toBe(first);
    expect(refreshed.body.user.email).toBe("rotate@example.com");

    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .expect(200);
    await refresh(second).expect(200);
  });

  it("treats a quick second use as a parallel refresh", async () => {
    await createTestUser({ email: "parallel@example.com" });

    const token = cookieValue(await signIn("parallel@example.com").expect(200), COOKIE) ?? "";
    const [a, b] = await Promise.all([refresh(token), refresh(token)]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(cookieValue(a, COOKIE)).not.toBe(cookieValue(b, COOKIE));
  });

  it("revokes the whole session when an old refresh token is replayed", async () => {
    await createTestUser({ email: "replay@example.com" });

    const stolen = cookieValue(await signIn("replay@example.com").expect(200), COOKIE) ?? "";
    const current = cookieValue(await refresh(stolen).expect(200), COOKIE) ?? "";

    // Move the rotation outside the grace window, as if replayed later.
    await prisma.refreshToken.updateMany({
      where: { rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });

    const replay = await refresh(stolen).expect(401);

    expect(replay.body.error.code).toBe("SESSION_EXPIRED");
    expect(cookieValue(replay, COOKIE)).toBe("");
    await refresh(current).expect(401);
  });

  it("signs out and rejects the cookie afterwards", async () => {
    await createTestUser({ email: "signout@example.com" });

    const token = cookieValue(await signIn("signout@example.com").expect(200), COOKIE) ?? "";
    const signOut = await request(app)
      .post("/api/auth/sign-out")
      .set(...cookieHeader(COOKIE, token))
      .expect(204);

    expect(cookieValue(signOut, COOKIE)).toBe("");
    await refresh(token).expect(401);
  });

  it("rejects refreshes from other origins and without a cookie", async () => {
    await createTestUser({ email: "origin@example.com" });

    const token = cookieValue(await signIn("origin@example.com").expect(200), COOKIE) ?? "";
    const crossSite = await refresh(token).set("Origin", "https://evil.example").expect(403);

    expect(crossSite.body.error.code).toBe("CROSS_SITE_REQUEST");
    await refresh(token).set("Origin", "http://localhost:3000").expect(200);
    await request(app).post("/api/auth/refresh").expect(401);
  });
});

describe("email verification and password reset", () => {
  let sendEmail: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await resetDatabase();
    sendEmail = vi.spyOn(mailer, "send").mockResolvedValue();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(disconnectTestDatabase);

  it("verifies the email from the link sent at sign-up", async () => {
    const user = await createTestUser({ email: "verify@example.com" });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "verify@example.com", subject: expect.stringContaining("Confirm") }),
    );

    const me = await request(app).get("/api/auth/me").set(...authHeader(user)).expect(200);

    expect(me.body).toMatchObject({ emailVerified: false, hasPassword: true, phone: null });

    const token = lastEmailToken(sendEmail);
    const verified = await request(app).post("/api/auth/email/verify").send({ token }).expect(200);

    expect(verified.body.emailVerified).toBe(true);

    const reused = await request(app).post("/api/auth/email/verify").send({ token }).expect(400);

    expect(reused.body.error.code).toBe("INVALID_AUTH_LINK");

    // Nothing to resend once verified.
    sendEmail.mockClear();
    await request(app).post("/api/auth/email/verification").set(...authHeader(user)).expect(202);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("only honours the newest verification link", async () => {
    const user = await createTestUser({ email: "newest@example.com" });
    const first = lastEmailToken(sendEmail);

    await request(app).post("/api/auth/email/verification").set(...authHeader(user)).expect(202);

    const second = lastEmailToken(sendEmail);

    await request(app).post("/api/auth/email/verify").send({ token: first }).expect(400);
    await request(app).post("/api/auth/email/verify").send({ token: second }).expect(200);
  });

  it("resets a password, signs out other sessions and burns the link", async () => {
    await createTestUser({ email: "reset@example.com" });

    const session = cookieValue(await signIn("reset@example.com").expect(200), COOKIE) ?? "";

    sendEmail.mockClear();
    await request(app).post("/api/auth/password/forgot").send({ email: "nobody@example.com" }).expect(202);
    expect(sendEmail).not.toHaveBeenCalled();

    await request(app).post("/api/auth/password/forgot").send({ email: "Reset@Example.com" }).expect(202);

    const token = lastEmailToken(sendEmail);

    await request(app)
      .post("/api/auth/password/reset")
      .send({ token, password: "weakpassword" })
      .expect(422);
    await request(app)
      .post("/api/auth/password/reset")
      .send({ token, password: "NewPassword456" })
      .expect(204);

    await signIn("reset@example.com").expect(401);
    const fresh = await signIn("reset@example.com", "NewPassword456").expect(200);

    expect(fresh.body.user.emailVerified).toBe(true);
    await refresh(session).expect(401);
    await request(app)
      .post("/api/auth/password/reset")
      .send({ token, password: "Another789Pass" })
      .expect(400);
  });
});

describe("phone codes", () => {
  let sendSms: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await resetDatabase();
    sendSms = vi.spyOn(smsSender, "send").mockResolvedValue();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(disconnectTestDatabase);

  async function linkPhone(user: Awaited<ReturnType<typeof createTestUser>>, phone: string) {
    await request(app)
      .post("/api/auth/phone/link/code")
      .set(...authHeader(user))
      .send({ phone })
      .expect(202);

    return request(app)
      .post("/api/auth/phone/link/verify")
      .set(...authHeader(user))
      .send({ phone, code: lastSmsCode(sendSms) })
      .expect(200);
  }

  it("links a phone number and signs in with a texted code", async () => {
    const user = await createTestUser();
    const linked = await linkPhone(user, "+44 7700 900123");

    expect(linked.body.phone).toBe("+447700900123");

    sendSms.mockClear();
    await request(app).post("/api/auth/phone/sign-in/code").send({ phone: "+15555550100" }).expect(202);
    expect(sendSms).not.toHaveBeenCalled();

    await request(app).post("/api/auth/phone/sign-in/code").send({ phone: "+447700900123" }).expect(202);

    const signedIn = await request(app)
      .post("/api/auth/phone/sign-in")
      .send({ phone: "+447700900123", code: lastSmsCode(sendSms) })
      .expect(200);

    expect(signedIn.body.user.id).toBe(user.id);
    expect(cookieValue(signedIn, COOKIE)).toBeTruthy();
  });

  it("burns a code after too many wrong guesses", async () => {
    const user = await createTestUser();

    await request(app)
      .post("/api/auth/phone/link/code")
      .set(...authHeader(user))
      .send({ phone: "+447700900124" })
      .expect(202);

    const code = lastSmsCode(sendSms);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let attempt = 0; attempt < AUTH_CONSTANTS.PHONE_CODE_MAX_ATTEMPTS; attempt += 1) {
      await request(app)
        .post("/api/auth/phone/link/verify")
        .set(...authHeader(user))
        .send({ phone: "+447700900124", code: wrong })
        .expect(400);
    }

    await request(app)
      .post("/api/auth/phone/link/verify")
      .set(...authHeader(user))
      .send({ phone: "+447700900124", code })
      .expect(400);
  });

  it("limits resends and keeps numbers unique across accounts", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();

    await linkPhone(owner, "+447700900125");

    const resend = await request(app)
      .post("/api/auth/phone/link/code")
      .set(...authHeader(owner))
      .send({ phone: "+447700900126" })
      .expect(202);

    expect(resend.status).toBe(202);
    await request(app)
      .post("/api/auth/phone/link/code")
      .set(...authHeader(owner))
      .send({ phone: "+447700900126" })
      .expect(429);

    const taken = await request(app)
      .post("/api/auth/phone/link/code")
      .set(...authHeader(other))
      .send({ phone: "+447700900125" })
      .expect(409);

    expect(taken.body.error.code).toBe("PHONE_ALREADY_IN_USE");

    const invalid = await request(app)
      .post("/api/auth/phone/link/code")
      .set(...authHeader(other))
      .send({ phone: "0770 0900 125" })
      .expect(422);

    expect(invalid.body.error.code).toBe("INVALID_PHONE_NUMBER");
  });

  it("reports the available sign-in methods", async () => {
    const providers = await request(app).get("/api/auth/providers").expect(200);

    expect(providers.body).toEqual({ google: false, phone: true });
    await request(app).get("/api/auth/google/start").expect(404);
  });
});
