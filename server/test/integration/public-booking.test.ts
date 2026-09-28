import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import type { EmailMessage, Mailer } from "../../src/infrastructure/messaging/mailer.js";
import { PublicBookingService, toWebOrigin } from "../../src/modules/public-booking/public-booking.service.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { createBookableSetup, holdSlot, type BookableSetup } from "../helpers/booking.js";
import { addTestMember } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

describe("public booking", () => {
  let setup: BookableSetup;
  let emails: EmailMessage[];
  let service: PublicBookingService;

  const mailer: Mailer = {
    send: (message) => {
      emails.push(message);
      return Promise.resolve();
    },
  };

  /** Sends a code the way the endpoint does and reads it back from the email. */
  async function codeFor(email: string, now: Date = new Date()): Promise<string> {
    await service.sendGuestCode(setup.business.slug, email, now);

    return /is (\d{6})\./.exec(emails.at(-1)?.text ?? "")?.[1] ?? "";
  }

  function verify(body: Record<string, unknown>) {
    return request(app).post(`/api/public/${setup.business.slug}/guest/verify`).send(body);
  }

  beforeEach(async () => {
    await resetDatabase();
    emails = [];
    service = new PublicBookingService(mailer);
    setup = await createBookableSetup({ daysAhead: 2 });
  });

  afterAll(disconnectTestDatabase);

  describe("guests", () => {
    it("books as a guest with an emailed code and gets an account behind the scenes", async () => {
      await request(app)
        .post(`/api/public/${setup.business.slug}/guest/code`)
        .send({ email: "guest@example.com" })
        .expect(202);
      // The endpoint's own email went to the log mailer; ask again after the resend wait.
      const code = await codeFor("Guest@Example.com", new Date(Date.now() + 61_000));

      expect(emails[0]).toMatchObject({ to: "guest@example.com", subject: `${code} is your code for Glow Salon` });

      await verify({ email: "guest@example.com", code: code === "000000" ? "111111" : "000000", name: "Guest Person" }).expect(400);

      const signedIn = await verify({
        email: "guest@example.com",
        code,
        name: "  Guest   Person ",
        phone: "+44 7700 900222",
      }).expect(200);

      expect(signedIn.body).toMatchObject({ user: { email: "guest@example.com", fullName: "Guest Person" }, tokenType: "Bearer" });
      expect(signedIn.headers["set-cookie"]?.[0]).toMatch(/^bw_refresh=/);

      // A code works once.
      await verify({ email: "guest@example.com", code, name: "Guest Person" }).expect(400);

      const guest: TestUser = { id: signedIn.body.user.id, email: "guest@example.com", accessToken: signedIn.body.accessToken };
      const hold = await holdSlot(guest, setup, setup.at("10:00")).expect(201);

      await request(app).post(`/api/appointments/${hold.body.id}/confirm`).set(...authHeader(guest)).expect(200);

      expect(
        await prisma.customer.findFirst({
          where: { businessId: setup.business.id, userId: guest.id },
          select: { name: true, phone: true },
        }),
      ).toEqual({ name: "Guest Person", phone: "+447700900222" });
      expect(await prisma.user.findUnique({ where: { email: "guest@example.com" }, select: { emailVerifiedAt: true } })).toEqual({
        emailVerifiedAt: expect.any(Date),
      });
    });

    it("signs an existing account in as it is, and limits codes", async () => {
      const existing = await createTestUser({ fullName: "Real Name", email: "known@example.com" });

      await service.sendGuestCode(setup.business.slug, "known@example.com");
      await expect(service.sendGuestCode(setup.business.slug, "known@example.com")).rejects.toMatchObject({ statusCode: 429 });

      const code = /is (\d{6})\./.exec(emails.at(-1)?.text ?? "")?.[1] ?? "";
      const signedIn = await verify({ email: "known@example.com", code, name: "Someone Else" }).expect(200);

      expect(signedIn.body.user).toMatchObject({ id: existing.id, fullName: "Real Name" });

      // Five wrong guesses use the code up.
      const next = await codeFor("known@example.com", new Date(Date.now() + 61_000));
      const wrong = next === "000000" ? "111111" : "000000";

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await verify({ email: "known@example.com", code: wrong, name: "Real Name" }).expect(400);
      }

      await verify({ email: "known@example.com", code: next, name: "Real Name" }).expect(400);
      await verify({ email: "bad", code: next, name: "Real Name" }).expect(422);
      await request(app).post("/api/public/no-such-business/guest/code").send({ email: "a@example.com" }).expect(404);

      // A business that turned guest booking off only takes bookings from accounts.
      await request(app)
        .patch(`/api/businesses/${setup.business.id}/settings`)
        .set(...authHeader(setup.owner))
        .send({ allowGuestBooking: false })
        .expect(200);
      await request(app).post(`/api/public/${setup.business.slug}/guest/code`).send({ email: "a@example.com" }).expect(403);
    });
  });

  describe("widget websites", () => {
    it("keeps the list of sites that may embed the widget", async () => {
      const base = `/api/businesses/${setup.business.id}/allowed-origins`;
      const added = await request(app)
        .post(base)
        .set(...authHeader(setup.owner))
        .send({ origin: "https://Glow.example/book?ref=1" })
        .expect(201);

      expect(added.body).toMatchObject({ origin: "https://glow.example" });
      expect(
        (await request(app).post(base).set(...authHeader(setup.owner)).send({ origin: "https://glow.example" }).expect(201)).body.id,
      ).toBe(added.body.id);
      await request(app).post(base).set(...authHeader(setup.owner)).send({ origin: "http://localhost:5173" }).expect(201);
      await request(app).post(base).set(...authHeader(setup.owner)).send({ origin: "http://glow.example" }).expect(422);
      await request(app).post(base).set(...authHeader(setup.owner)).send({ origin: "not a site" }).expect(422);

      const staff = await createTestUser();

      await addTestMember(setup.owner, setup.business, staff, "STAFF");
      await request(app).post(base).set(...authHeader(staff)).send({ origin: "https://other.example" }).expect(403);

      expect((await request(app).get(`/api/public/${setup.business.slug}/embed`).expect(200)).body).toEqual({
        origins: ["https://glow.example", "http://localhost:5173"],
      });

      await request(app).delete(`${base}/${added.body.id}`).set(...authHeader(setup.owner)).expect(204);
      await request(app).delete(`${base}/${added.body.id}`).set(...authHeader(setup.owner)).expect(404);
      expect((await request(app).get(`/api/public/${setup.business.slug}/embed`).expect(200)).body.origins).toEqual([
        "http://localhost:5173",
      ]);
    });

    it("keeps only the scheme, host and port of a website", () => {
      expect(toWebOrigin("https://shop.example:8443/a/b?c")).toBe("https://shop.example:8443");
      expect(toWebOrigin("javascript:alert(1)")).toBeNull();
      expect(toWebOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    });
  });
});
