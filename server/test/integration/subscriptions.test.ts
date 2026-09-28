import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { PAYMENT_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import type { EmailMessage, Mailer } from "../../src/infrastructure/messaging/mailer.js";
import type { SmsMessage, SmsSender } from "../../src/infrastructure/messaging/sms-sender.js";
import { stripeSignatureHeader } from "../../src/integrations/stripe/stripe-signature.js";
import type { BillingGateway, SubscriptionCheckoutRequest } from "../../src/integrations/stripe/stripe.client.js";
import { NotificationService } from "../../src/modules/notifications/notification.service.js";
import type { ReminderScheduler } from "../../src/modules/notifications/reminder-scheduler.js";
import { monthOf } from "../../src/modules/subscriptions/dal/subscription.dal.js";
import { SubscriptionService } from "../../src/modules/subscriptions/subscription.service.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { bookSlot, createBookableSetup, type BookableSetup } from "../helpers/booking.js";
import { addTestMember } from "../helpers/business.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";

const WEBHOOK_SECRET = "whsec_billing_test";

class FakeBilling implements BillingGateway {
  public checkouts: SubscriptionCheckoutRequest[] = [];
  public portals: string[] = [];

  public createSubscriptionCheckout(request: SubscriptionCheckoutRequest) {
    this.checkouts.push(request);
    return Promise.resolve({ id: `cs_${this.checkouts.length}`, url: `https://checkout.stripe.test/${this.checkouts.length}` });
  }

  public createBillingPortalSession(customerId: string) {
    this.portals.push(customerId);
    return Promise.resolve(`https://billing.stripe.test/${customerId}`);
  }
}

describe("plans and billing", () => {
  const original = {
    key: env.STRIPE_SECRET_KEY,
    secret: env.STRIPE_WEBHOOK_SECRET,
    starter: env.STRIPE_PRICE_STARTER,
    pro: env.STRIPE_PRICE_PRO,
  };
  let setup: BookableSetup;
  let billing: FakeBilling;
  let service: SubscriptionService;
  let eventSequence = 0;

  function enableBilling(): void {
    env.STRIPE_SECRET_KEY = "sk_test_fake";
    env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    env.STRIPE_PRICE_STARTER = "price_starter";
    env.STRIPE_PRICE_PRO = "price_pro";
  }

  function addProvider(name: string) {
    return request(app)
      .post(`/api/businesses/${setup.business.id}/staff`)
      .set(...authHeader(setup.owner))
      .send({ displayName: name });
  }

  function billingView(user: TestUser = setup.owner) {
    return request(app).get(`/api/businesses/${setup.business.id}/billing`).set(...authHeader(user));
  }

  /** Sends a Stripe event through the real, signed webhook. */
  function stripeEvent(type: string, object: Record<string, unknown>) {
    eventSequence += 1;

    const payload = JSON.stringify({ id: `evt_billing_${eventSequence}`, type, data: { object } });

    return request(app)
      .post(PAYMENT_CONSTANTS.WEBHOOK_PATH)
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", stripeSignatureHeader(payload, WEBHOOK_SECRET, Math.floor(Date.now() / 1_000)))
      .send(payload);
  }

  beforeEach(async () => {
    await resetDatabase();
    setup = await createBookableSetup({ daysAhead: 2 });
    billing = new FakeBilling();
    service = new SubscriptionService(() => billing);
    enableBilling();
  });

  afterEach(() => {
    env.STRIPE_SECRET_KEY = original.key;
    env.STRIPE_WEBHOOK_SECRET = original.secret;
    env.STRIPE_PRICE_STARTER = original.starter;
    env.STRIPE_PRICE_PRO = original.pro;
  });

  afterAll(disconnectTestDatabase);

  it("holds a free business to one provider, 100 chats and no texts a month", async () => {
    const view = await billingView().expect(200);

    expect(view.body).toMatchObject({
      enabled: true,
      plan: { id: "FREE", limits: { staffSeats: 1, aiConversations: 100, textMessages: 0 } },
      source: "free",
      usage: { staffSeats: 1, aiConversations: 0, textMessages: 0 },
    });
    expect(view.body.plans.map((plan: { id: string }) => plan.id)).toEqual(["FREE", "STARTER", "PRO"]);

    const refused = await addProvider("Bilal").expect(403);

    expect(refused.body.error).toMatchObject({
      code: "PLAN_LIMIT_REACHED",
      message: "The Free plan includes 1 provider. Upgrade the plan in Billing to get more.",
    });

    // A chat already open carries on; a new one needs the month's allowance.
    const regular = await createTestUser();
    const openChat = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(regular))
      .send({ businessSlug: setup.business.slug })
      .expect(201);

    await prisma.usageCounter.updateMany({
      where: { businessId: setup.business.id, metric: "ai_conversations" },
      data: { count: 100 },
    });

    const again = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(regular))
      .send({ businessSlug: setup.business.slug })
      .expect(201);

    expect(again.body.id).toBe(openChat.body.id);
    await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(await createTestUser()))
      .send({ businessSlug: setup.business.slug })
      .expect(403);

    // Texts aren't part of the free plan: the SMS is recorded as not sent, the email still goes.
    const texts: SmsMessage[] = [];
    const emails: EmailMessage[] = [];
    const scheduler: ReminderScheduler = {
      schedule: () => Promise.resolve(),
      cancel: () => Promise.resolve(),
      scheduleReviewRequest: () => Promise.resolve(),
    };
    const sms: SmsSender = { isAvailable: true, send: (message) => (texts.push(message), Promise.resolve(undefined)) };
    const mailer: Mailer = { send: (message) => (emails.push(message), Promise.resolve()) };
    const customer = await createTestUser();
    const bookingId = await bookSlot(customer, setup, setup.at("10:00"));

    await prisma.customer.updateMany({ where: { businessId: setup.business.id, userId: customer.id }, data: { phone: "+447700900123" } });

    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: bookingId, type: "booking.confirmed" } });

    await new NotificationService(scheduler, mailer, sms).handleBookingEvent({
      id: event.id,
      type: event.type,
      businessId: event.businessId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Record<string, unknown>,
      createdAt: event.createdAt.toISOString(),
    });

    expect(texts).toHaveLength(0);
    expect(emails).toHaveLength(1);
    expect(await prisma.notification.findFirst({ where: { businessId: setup.business.id, channel: "SMS" }, select: { status: true, error: true } })).toEqual({
      status: "FAILED",
      error: "The plan's text messages for this month are used up",
    });
    expect((await billingView().expect(200)).body.usage).toMatchObject({ aiConversations: 100 });
  });

  it("subscribes through Stripe Checkout and follows the subscription's life from Stripe's events", async () => {
    const redirect = await service.startCheckout(setup.business.id, "STARTER", "owner@example.com");

    expect(redirect).toEqual({ url: "https://checkout.stripe.test/1" });
    expect(billing.checkouts[0]).toMatchObject({
      priceId: "price_starter",
      customerId: null,
      customerEmail: "owner@example.com",
      metadata: { businessId: setup.business.id, plan: "STARTER" },
    });
    await expect(service.openPortal(setup.business.id)).rejects.toMatchObject({ code: "NO_BILLING_ACCOUNT" });

    await stripeEvent("checkout.session.completed", {
      id: "cs_1",
      mode: "subscription",
      client_reference_id: setup.business.id,
      customer: "cus_1",
      subscription: "sub_1",
      metadata: { businessId: setup.business.id, plan: "STARTER" },
    }).expect(200);

    expect((await billingView().expect(200)).body).toMatchObject({
      plan: { id: "STARTER" },
      source: "stripe",
      status: "active",
      canManageInPortal: true,
    });
    await addProvider("Bilal").expect(201);
    await expect(service.startCheckout(setup.business.id, "PRO", "owner@example.com")).rejects.toMatchObject({
      code: "BILLING_MANAGED_IN_PORTAL",
    });
    expect(await service.openPortal(setup.business.id)).toEqual({ url: "https://billing.stripe.test/cus_1" });

    // Moving to Pro in the portal, then a card that fails: Pro stays while Stripe retries.
    const periodEnd = Math.floor(Date.now() / 1_000) + 30 * 24 * 60 * 60;

    await stripeEvent("customer.subscription.updated", {
      id: "sub_1",
      customer: "cus_1",
      status: "past_due",
      cancel_at_period_end: true,
      metadata: { businessId: setup.business.id },
      items: { data: [{ price: { id: "price_pro" }, current_period_end: periodEnd }] },
    }).expect(200);

    expect((await billingView().expect(200)).body).toMatchObject({
      plan: { id: "PRO", limits: { staffSeats: 15 } },
      status: "past_due",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(periodEnd * 1_000).toISOString(),
    });

    await stripeEvent("customer.subscription.deleted", { id: "sub_1", customer: "cus_1", status: "canceled", items: { data: [] } }).expect(200);

    expect((await billingView().expect(200)).body).toMatchObject({ plan: { id: "FREE" }, source: "free", status: null });
    // Back on Free with two providers: no third.
    await addProvider("Chen").expect(403);

    // A new subscription reuses the Stripe customer.
    await service.startCheckout(setup.business.id, "PRO", "owner@example.com");
    expect(billing.checkouts[1]).toMatchObject({ priceId: "price_pro", customerId: "cus_1" });
  });

  it("lets only owners pay, and a platform admin grant a plan for free", async () => {
    const manager = await createTestUser();

    await addTestMember(setup.owner, setup.business, manager, "MANAGER");
    await billingView(manager).expect(200);
    await request(app)
      .post(`/api/businesses/${setup.business.id}/billing/checkout`)
      .set(...authHeader(manager))
      .send({ plan: "PRO" })
      .expect(403);

    const admin = await createTestUser({ fullName: "Ada Admin" });

    await prisma.user.update({ where: { id: admin.id }, data: { platformRole: "ADMIN" } });

    const granted = await request(app)
      .post(`/api/admin/businesses/${setup.business.id}/plan`)
      .set(...authHeader(admin))
      .send({ plan: "PRO" })
      .expect(200);

    expect(granted.body.plan).toEqual({ id: "PRO", source: "complimentary", status: "complimentary" });
    await addProvider("Bilal").expect(201);

    await request(app).post(`/api/admin/businesses/${setup.business.id}/plan`).set(...authHeader(admin)).send({ plan: "FREE" }).expect(200);
    expect((await billingView().expect(200)).body.plan.id).toBe("FREE");
    expect(await prisma.adminAuditLog.count({ where: { action: "business.plan" } })).toBe(2);
  });

  it("limits nothing while billing isn't set up", async () => {
    env.STRIPE_PRICE_STARTER = undefined;

    expect((await billingView().expect(200)).body.enabled).toBe(false);
    await addProvider("Bilal").expect(201);
    await addProvider("Chen").expect(201);
    await request(app)
      .post(`/api/businesses/${setup.business.id}/billing/checkout`)
      .set(...authHeader(setup.owner))
      .send({ plan: "PRO" })
      .expect(503);

    // Usage is still counted, for when plans switch on.
    await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(await createTestUser()))
      .send({ businessSlug: setup.business.slug })
      .expect(201);
    expect(
      await prisma.usageCounter.findFirst({
        where: { businessId: setup.business.id, month: new Date(`${monthOf(new Date())}T00:00:00Z`) },
        select: { metric: true, count: true },
      }),
    ).toEqual({ metric: "ai_conversations", count: 1 });
  });
});
