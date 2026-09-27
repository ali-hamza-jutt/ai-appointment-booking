import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { CALENDAR_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { CalendarApiError } from "../../src/integrations/calendar/calendar-http.js";
import type {
  BusyInterval,
  CalendarEventInput,
  CalendarGrant,
  CalendarProviderClient,
  CalendarTokens,
  CalendarWatch,
  RenewedWatch,
} from "../../src/integrations/calendar/calendar.dto.js";
import { CalendarConnectionService } from "../../src/modules/calendar/calendar-connection.service.js";
import { CalendarSyncService, hashChannelToken } from "../../src/modules/calendar/calendar-sync.service.js";
import { calendarDal } from "../../src/modules/calendar/dal/calendar.dal.js";
import type { CalendarSyncJobData } from "../../src/modules/calendar/dto/calendar.dto.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup, holdSlot, type BookableSetup } from "../helpers/booking.js";
import { addTestMember } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

/** A calendar provider that keeps events in memory and records every call. */
class FakeCalendar implements CalendarProviderClient {
  public readonly provider = "GOOGLE" as const;
  public busy: BusyInterval[] = [];
  public events = new Map<string, CalendarEventInput>();
  public calls: string[] = [];
  public ownEventIdsSeen: string[] = [];
  public refreshFails = false;
  public listFailsAuth = false;

  public authorizationUrl(input: { state: string }): string {
    return `https://calendar.example/consent?state=${encodeURIComponent(input.state)}`;
  }

  public exchangeCode(input: { code: string }): Promise<CalendarGrant> {
    this.calls.push(`exchange:${input.code}`);

    return Promise.resolve({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() + 3_600_000),
      accountEmail: "sana@calendar.example",
    });
  }

  public refreshAccessToken(): Promise<CalendarTokens> {
    this.calls.push("refresh");

    return this.refreshFails
      ? Promise.reject(new CalendarApiError("invalid_grant", "auth", 400))
      : Promise.resolve({ accessToken: "access-2", expiresAt: new Date(Date.now() + 3_600_000) });
  }

  public listBusy(_token: string, _range: unknown, ownEventIds: ReadonlySet<string>): Promise<BusyInterval[]> {
    this.calls.push("listBusy");
    this.ownEventIdsSeen = [...ownEventIds];

    return this.listFailsAuth ? Promise.reject(new CalendarApiError("Unauthorized", "auth", 401)) : Promise.resolve(this.busy);
  }

  public upsertEvent(_token: string, event: CalendarEventInput, existingEventId: string | null): Promise<string> {
    const id = existingEventId ?? `event-${event.bookingId}`;

    this.calls.push(`upsert:${existingEventId ? "update" : "create"}`);
    this.events.set(id, event);

    return Promise.resolve(id);
  }

  public deleteEvent(_token: string, eventId: string): Promise<void> {
    this.calls.push("delete");
    this.events.delete(eventId);

    return Promise.resolve();
  }

  public watch(): Promise<CalendarWatch> {
    return Promise.reject(new Error("push is off in tests"));
  }

  public renewWatch(): Promise<RenewedWatch> {
    return Promise.reject(new Error("push is off in tests"));
  }

  public stopWatch(): Promise<void> {
    this.calls.push("stopWatch");
    return Promise.resolve();
  }

  public revoke(): Promise<void> {
    this.calls.push("revoke");
    return Promise.resolve();
  }
}

describe("calendar sync", () => {
  let calendar: FakeCalendar;
  let sync: CalendarSyncService;
  let connections: CalendarConnectionService;
  let queued: CalendarSyncJobData[];
  let setup: BookableSetup;
  let customer: TestUser;

  /** Runs the whole OAuth round trip as the owner and returns the new connection. */
  async function connect() {
    const { authorizationUrl } = await connections.start(setup.business.id, setup.staffId, { id: setup.owner.id, role: "OWNER" }, "GOOGLE");
    const state = new URL(authorizationUrl).searchParams.get("state") ?? "";
    const destination = await connections.complete({ code: "auth-code", state });

    expect(destination).toMatch(/\/business\/staff\?calendar=connected$/);

    return prisma.calendarConnection.findFirstOrThrow({ where: { businessId: setup.business.id, staffId: setup.staffId } });
  }

  async function openTimes(): Promise<string[]> {
    const response = await request(app)
      .get(`/api/public/${setup.business.slug}/availability`)
      .query({ serviceId: setup.serviceId, from: setup.day, to: setup.day, tz: "UTC" })
      .expect(200);

    return response.body.days.flatMap((day: { slots: Array<{ time: string }> }) => day.slots.map((slot) => slot.time));
  }

  beforeEach(async () => {
    await resetDatabase();
    calendar = new FakeCalendar();
    sync = new CalendarSyncService({ GOOGLE: calendar });
    queued = [];
    connections = new CalendarConnectionService(sync, {
      enqueue: (data: CalendarSyncJobData) => {
        queued.push(data);
        return Promise.resolve();
      },
    });
    setup = await createBookableSetup({ daysAhead: 2 });
    customer = await createTestUser();
  });

  afterAll(disconnectTestDatabase);

  it("connects through OAuth, keeps tokens encrypted and queues the first sync", async () => {
    const connection = await connect();

    expect(calendar.calls).toContain("exchange:auth-code");
    expect(connection).toMatchObject({ provider: "GOOGLE", status: "ACTIVE", accountEmail: "sana@calendar.example" });
    expect(connection.refreshTokenEncrypted).not.toContain("refresh-1");
    expect(sync.open(connection.refreshTokenEncrypted)).toBe("refresh-1");
    expect(queued).toEqual([{ businessId: setup.business.id, connectionId: connection.id }]);

    const listed = await connections.listConnections(setup.business.id);

    expect(listed.items).toEqual([
      expect.objectContaining({ staffId: setup.staffId, accountEmail: "sana@calendar.example", liveUpdates: false }),
    ]);
  });

  it("turns a refused, expired or tampered OAuth return into a message on the staff page", async () => {
    const { authorizationUrl } = await connections.start(setup.business.id, setup.staffId, { id: setup.owner.id, role: "OWNER" }, "GOOGLE");
    const state = new URL(authorizationUrl).searchParams.get("state") ?? "";

    await expect(connections.complete({ error: "access_denied" })).resolves.toMatch(/calendar=error&reason=denied$/);
    await expect(connections.complete({ code: "x", state: `${state.slice(0, -4)}AAAA` })).resolves.toMatch(/reason=invalid$/);
    await expect(connections.complete({ code: "x" })).resolves.toMatch(/reason=invalid$/);

    const expired = sync.seal(
      JSON.stringify({
        provider: "GOOGLE",
        businessId: setup.business.id,
        staffId: setup.staffId,
        userId: setup.owner.id,
        codeVerifier: "v",
        expiresAt: Date.now() - 1,
      }),
    );

    await expect(connections.complete({ code: "x", state: expired })).resolves.toMatch(/reason=expired$/);
    expect(await prisma.calendarConnection.count({ where: { businessId: setup.business.id } })).toBe(0);
  });

  it("lets staff connect only their own calendar", async () => {
    const member = await createTestUser();

    await addTestMember(setup.owner, setup.business, member, "STAFF");
    await expect(
      connections.start(setup.business.id, setup.staffId, { id: member.id, role: "STAFF" }, "GOOGLE"),
    ).rejects.toMatchObject({ statusCode: 403 });

    await prisma.staff.update({ where: { id: setup.staffId, businessId: setup.business.id }, data: { userId: member.id } });
    await expect(
      connections.start(setup.business.id, setup.staffId, { id: member.id, role: "STAFF" }, "GOOGLE"),
    ).resolves.toHaveProperty("authorizationUrl");
  });

  it("blocks times that are busy in the staff member's calendar, and frees them again", async () => {
    const connection = await connect();

    expect(await openTimes()).toContain("10:00");

    calendar.busy = [{ startsAt: new Date(setup.at("10:00")), endsAt: new Date(setup.at("11:30")) }];
    await sync.syncConnection(setup.business.id, connection.id);

    const blocked = await openTimes();

    expect(blocked).not.toContain("10:00");
    expect(blocked).not.toContain("11:00");
    expect(blocked).toContain("12:00");
    // Holding the busy time directly is refused too.
    await holdSlot(customer, setup, setup.at("10:00")).expect(409);

    calendar.busy = [];
    await sync.syncConnection(setup.business.id, connection.id);

    expect(await openTimes()).toContain("10:00");
    expect(
      await prisma.calendarConnection.findFirstOrThrow({
        where: { businessId: setup.business.id, id: connection.id },
        select: { lastSyncedAt: true, lastError: true },
      }),
    ).toMatchObject({ lastSyncedAt: expect.any(Date), lastError: null });
  });

  it("writes confirmed bookings to the calendar, moves them and removes them when cancelled", async () => {
    const connection = await connect();
    const bookingId = await bookSlot(customer, setup, setup.at("14:00"));

    await sync.reconcileBooking(setup.business.id, bookingId);

    const eventId = `event-${bookingId}`;

    expect(calendar.events.get(eventId)).toMatchObject({
      bookingId,
      summary: expect.stringContaining("Haircut"),
      startsAt: new Date(setup.at("14:00")),
    });
    expect(
      await prisma.booking.findFirstOrThrow({
        where: { businessId: setup.business.id, id: bookingId },
        select: { calendarEventId: true, calendarConnectionId: true },
      }),
    ).toEqual({ calendarEventId: eventId, calendarConnectionId: connection.id });

    // The booking's own event is never read back as busy time.
    await sync.syncConnection(setup.business.id, connection.id);
    expect(calendar.ownEventIdsSeen).toEqual([eventId]);

    await request(app)
      .patch(`/api/appointments/${bookingId}/reschedule`)
      .set(...authHeader(customer))
      .send({ scheduledDate: setup.day, scheduledTime: "15:00" })
      .expect(200);
    await sync.reconcileBooking(setup.business.id, bookingId);

    expect(calendar.calls.filter((call) => call.startsWith("upsert"))).toEqual(["upsert:create", "upsert:update"]);
    expect(calendar.events.get(eventId)?.startsAt).toEqual(new Date(setup.at("15:00")));

    await request(app).patch(`/api/appointments/${bookingId}/cancel`).set(...authHeader(customer)).send({}).expect(200);
    await sync.reconcileBooking(setup.business.id, bookingId);

    expect(calendar.events.size).toBe(0);
    expect(
      await prisma.booking.findFirstOrThrow({
        where: { businessId: setup.business.id, id: bookingId },
        select: { calendarEventId: true },
      }),
    ).toEqual({ calendarEventId: null });
  });

  it("writes bookings made before the calendar was connected on its first sync", async () => {
    const bookingId = await bookSlot(customer, setup, setup.at("09:00"));
    const connection = await connect();

    await sync.syncConnection(setup.business.id, connection.id);

    expect(calendar.events.has(`event-${bookingId}`)).toBe(true);
  });

  it("asks for a reconnect when the provider refuses the grant", async () => {
    const connection = await connect();

    calendar.listFailsAuth = true;
    calendar.refreshFails = true;
    await sync.syncConnection(setup.business.id, connection.id);

    const stored = await prisma.calendarConnection.findFirstOrThrow({
      where: { businessId: setup.business.id, id: connection.id },
      select: { status: true, lastError: true },
    });

    expect(stored).toEqual({ status: "NEEDS_RECONNECT", lastError: "invalid_grant" });

    // A connection waiting for a reconnect is left alone.
    calendar.calls = [];
    await sync.syncConnection(setup.business.id, connection.id);
    expect(calendar.calls).toEqual([]);
  });

  it("queues a sync for genuine push notifications only", async () => {
    const connection = await connect();

    await calendarDal.saveWatch(setup.business.id, connection.id, {
      channelId: "channel-1",
      channelResourceId: "resource-1",
      channelTokenHash: hashChannelToken("channel-secret"),
      channelExpiresAt: new Date(Date.now() + 86_400_000),
    });
    queued = [];

    await connections.handleGoogleNotification({ channelId: "channel-1", channelToken: "channel-secret", resourceState: "sync" });
    await connections.handleGoogleNotification({ channelId: "channel-1", channelToken: "wrong", resourceState: "exists" });
    expect(queued).toHaveLength(0);

    await connections.handleGoogleNotification({ channelId: "channel-1", channelToken: "channel-secret", resourceState: "exists" });
    await connections.handleMicrosoftNotifications({
      value: [
        { subscriptionId: "channel-1", clientState: "channel-secret" },
        { subscriptionId: "channel-1", clientState: "channel-secret" },
        { subscriptionId: "unknown", clientState: "channel-secret" },
      ],
    });

    expect(queued).toEqual([
      { businessId: setup.business.id, connectionId: connection.id },
      { businessId: setup.business.id, connectionId: connection.id },
    ]);
  });

  it("disconnects: stops the channel, revokes the grant and frees the busy times", async () => {
    const connection = await connect();

    calendar.busy = [{ startsAt: new Date(setup.at("10:00")), endsAt: new Date(setup.at("11:00")) }];
    await sync.syncConnection(setup.business.id, connection.id);
    await calendarDal.saveWatch(setup.business.id, connection.id, {
      channelId: "channel-2",
      channelResourceId: null,
      channelTokenHash: hashChannelToken("s"),
      channelExpiresAt: new Date(Date.now() + 86_400_000),
    });

    await connections.disconnect(setup.business.id, setup.staffId, { id: setup.owner.id, role: "OWNER" });

    expect(calendar.calls).toEqual(expect.arrayContaining(["stopWatch", "revoke"]));
    expect(await prisma.externalBusy.count({ where: { businessId: setup.business.id, staffId: setup.staffId } })).toBe(0);
    expect(await openTimes()).toContain("10:00");
    await expect(
      connections.disconnect(setup.business.id, setup.staffId, { id: setup.owner.id, role: "OWNER" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("serves the connection API and the provider endpoints", async () => {
    const base = `/api/businesses/${setup.business.id}`;

    // No provider is configured in tests, so starting a connection is unavailable.
    await request(app)
      .post(`${base}/staff/${setup.staffId}/calendar-connection`)
      .set(...authHeader(setup.owner))
      .send({ provider: "GOOGLE" })
      .expect(503);
    await request(app).get("/api/calendar/providers").set(...authHeader(setup.owner)).expect(200, { google: false, microsoft: false });
    await request(app).get(`${base}/calendar-connections`).set(...authHeader(setup.owner)).expect(200, { items: [] });
    await request(app).get(`${base}/calendar-connections`).set(...authHeader(customer)).expect(404);

    // Graph's subscription handshake is echoed back as plain text.
    const handshake = await request(app)
      .post(`${CALENDAR_CONSTANTS.MICROSOFT_WEBHOOK_PATH}?validationToken=${encodeURIComponent("check me")}`)
      .expect(200);

    expect(handshake.text).toBe("check me");
    await request(app)
      .post(CALENDAR_CONSTANTS.GOOGLE_WEBHOOK_PATH)
      .set("X-Goog-Channel-ID", "unknown")
      .set("X-Goog-Resource-State", "exists")
      .expect(200);

    const callback = await request(app).get(CALENDAR_CONSTANTS.CALLBACK_PATH).query({ error: "access_denied" }).expect(302);

    expect(callback.headers.location).toMatch(/\/business\/staff\?calendar=error&reason=denied$/);
  });
});
