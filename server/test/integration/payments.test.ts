import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { PAYMENT_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { stripeSignatureHeader } from "../../src/integrations/stripe/stripe-signature.js";
import type {
  CheckoutRequest,
  PaymentGateway,
  StripeAccount,
  StripeCheckoutSession,
} from "../../src/integrations/stripe/stripe.client.js";
import { bookingMaintenanceService } from "../../src/modules/bookings/booking-maintenance.service.js";
import { ChatOrchestrationService } from "../../src/modules/chat/chat-orchestration.service.js";
import type { ChatMessagePart } from "../../src/modules/chat/dto/chat.dto.js";
import type { OutboxMessage } from "../../src/modules/outbox/dto/outbox.dto.js";
import { PaymentAccountService } from "../../src/modules/payments/payment-account.service.js";
import { PaymentService } from "../../src/modules/payments/payment.service.js";
import { authHeader, createTestUser, type TestUser } from "../helpers/auth.js";
import { createBookableSetup, holdSlot, type BookableSetup } from "../helpers/booking.js";
import { disconnectTestDatabase, resetDatabase } from "../helpers/database.js";
import { ScriptedProvider } from "../helpers/scripted-provider.js";

/** Stripe as far as BookWise uses it, kept in memory. */
class FakeStripe implements PaymentGateway {
  public checkouts: Array<{ accountId: string; request: CheckoutRequest; idempotencyKey: string }> = [];
  public expired: string[] = [];
  public refunds: Array<{ paymentIntentId: string; amountMinor: number; idempotencyKey: string }> = [];
  public accounts: StripeAccount[] = [];

  public createAccount(): Promise<StripeAccount> {
    const account = { id: `acct_${this.accounts.length + 1}`, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };

    this.accounts.push(account);
    return Promise.resolve(account);
  }

  public retrieveAccount(accountId: string): Promise<StripeAccount> {
    return Promise.resolve({ id: accountId, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
  }

  public createOnboardingLink(accountId: string): Promise<string> {
    return Promise.resolve(`https://connect.stripe.test/onboard/${accountId}`);
  }

  public createDashboardLink(accountId: string): Promise<string> {
    return Promise.resolve(`https://connect.stripe.test/dashboard/${accountId}`);
  }

  public createCheckoutSession(accountId: string, request: CheckoutRequest, idempotencyKey: string): Promise<StripeCheckoutSession> {
    this.checkouts.push({ accountId, request, idempotencyKey });

    const id = `cs_test_${this.checkouts.length}`;

    return Promise.resolve({ id, url: `https://checkout.stripe.test/${id}`, expiresAt: request.expiresAt });
  }

  public expireCheckoutSession(sessionId: string): Promise<void> {
    this.expired.push(sessionId);
    return Promise.resolve();
  }

  public refund(paymentIntentId: string, amountMinor: number, idempotencyKey: string): Promise<{ amountMinor: number }> {
    this.refunds.push({ paymentIntentId, amountMinor, idempotencyKey });
    return Promise.resolve({ amountMinor });
  }
}

describe("payments", () => {
  const original = { key: env.STRIPE_SECRET_KEY, secret: env.STRIPE_WEBHOOK_SECRET };
  let stripe: FakeStripe;
  let payments: PaymentService;
  let setup: BookableSetup;
  let customer: TestUser;

  function paidEvent(sessionId: string, paymentIntent = "pi_1") {
    return {
      id: `evt_${randomUUID()}`,
      type: "checkout.session.completed",
      data: { object: { id: sessionId, payment_status: "paid", payment_intent: paymentIntent } },
    };
  }

  async function booking(bookingId: string) {
    return prisma.booking.findFirstOrThrow({
      where: { businessId: setup.business.id, id: bookingId },
      select: { status: true, holdExpiresAt: true },
    });
  }

  async function payment(bookingId: string) {
    return prisma.payment.findFirstOrThrow({
      where: { businessId: setup.business.id, bookingId },
      orderBy: { createdAt: "desc" },
    });
  }

  async function outboxMessage(bookingId: string, type: string): Promise<OutboxMessage> {
    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: bookingId, type }, orderBy: { createdAt: "desc" } });

    return {
      id: event.id,
      type: event.type,
      businessId: event.businessId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Record<string, unknown>,
      createdAt: event.createdAt.toISOString(),
    };
  }

  /** Holds 10:00 and confirms it, which opens Checkout for the deposit. */
  async function bookAwaitingPayment(time = "10:00") {
    const hold = await holdSlot(customer, setup, setup.at(time)).expect(201);

    return payments.confirmForCustomer(customer.id, hold.body.id);
  }

  async function payFor(bookingId: string) {
    const pending = await payment(bookingId);

    await payments.handleStripeEvent(paidEvent(pending.checkoutSessionId));
  }

  beforeAll(() => {
    env.STRIPE_SECRET_KEY = "sk_test_fake";
    env.STRIPE_WEBHOOK_SECRET = "whsec_test_one,whsec_test_two";
  });

  afterAll(async () => {
    env.STRIPE_SECRET_KEY = original.key;
    env.STRIPE_WEBHOOK_SECRET = original.secret;
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    stripe = new FakeStripe();
    payments = new PaymentService(stripe);
    setup = await createBookableSetup({ daysAhead: 2 });
    customer = await createTestUser();

    await prisma.service.update({
      where: { id: setup.serviceId, businessId: setup.business.id },
      data: { paymentMode: "DEPOSIT", depositMinor: 1_000 },
    });
    await prisma.paymentAccount.create({
      data: { businessId: setup.business.id, stripeAccountId: "acct_salon", chargesEnabled: true },
    });
  });

  it("asks for the deposit when confirming and confirms once Stripe reports the payment", async () => {
    const confirmed = await bookAwaitingPayment();

    expect(confirmed.status).toBe("PENDING_PAYMENT");
    expect(confirmed.payment).toMatchObject({
      kind: "DEPOSIT",
      status: "PENDING",
      amountMinor: 1_000,
      currency: "USD",
      checkoutUrl: "https://checkout.stripe.test/cs_test_1",
    });
    expect(stripe.checkouts[0]).toMatchObject({
      accountId: "acct_salon",
      request: {
        amountMinor: 1_000,
        currency: "USD",
        description: "Haircut at Glow Salon (deposit)",
        customerEmail: customer.email,
        metadata: { bookingId: confirmed.id, businessId: setup.business.id },
      },
    });
    expect(stripe.checkouts[0]?.request.successUrl).toMatch(new RegExp(`/appointments/${confirmed.id}\\?payment=success$`));

    // Checkout stays open at least 31 minutes, and the time is held as long.
    const held = await booking(confirmed.id);

    expect(held.holdExpiresAt?.getTime()).toBeGreaterThanOrEqual(Date.now() + 30 * 60_000);
    expect(held.holdExpiresAt).toEqual(stripe.checkouts[0]?.request.expiresAt);

    // Nobody else can take the time while it waits for payment.
    await holdSlot(await createTestUser(), setup, setup.at("10:00")).expect(409);

    await payFor(confirmed.id);
    await payFor(confirmed.id);

    expect((await booking(confirmed.id)).status).toBe("CONFIRMED");
    expect(await payment(confirmed.id)).toMatchObject({ status: "SUCCEEDED", paymentIntentId: "pi_1", paidAt: expect.any(Date) });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: confirmed.id, type: "booking.confirmed" } })).toBe(1);
  });

  it("reuses the open Checkout when the customer confirms or resumes again", async () => {
    const confirmed = await bookAwaitingPayment();
    const again = await payments.confirmForCustomer(customer.id, confirmed.id);
    const resumed = await payments.resumeForCustomer(customer.id, confirmed.id);

    expect(stripe.checkouts).toHaveLength(1);
    expect(again.payment?.checkoutUrl).toBe(confirmed.payment?.checkoutUrl);
    expect(resumed.payment?.checkoutUrl).toBe(confirmed.payment?.checkoutUrl);
  });

  it("books without payment until the business's Stripe account can take charges", async () => {
    await prisma.paymentAccount.updateMany({ where: { businessId: setup.business.id }, data: { chargesEnabled: false } });

    const confirmed = await bookAwaitingPayment();

    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.payment).toBeNull();
    expect(stripe.checkouts).toHaveLength(0);
    await expect(payments.resumeForCustomer(customer.id, confirmed.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("closes Checkout when an unpaid booking expires, and refunds a payment that arrives too late", async () => {
    const confirmed = await bookAwaitingPayment();

    await prisma.booking.updateMany({
      where: { businessId: setup.business.id, id: confirmed.id },
      data: { holdExpiresAt: new Date(Date.now() - 1_000) },
    });
    await bookingMaintenanceService.expireLapsedHolds();
    await payments.handleBookingEvent(await outboxMessage(confirmed.id, "booking.expired"));

    expect((await booking(confirmed.id)).status).toBe("EXPIRED");
    expect(stripe.expired).toEqual(["cs_test_1"]);
    expect((await payment(confirmed.id)).status).toBe("CANCELLED");

    // Stripe reports a payment completed just before its session closed.
    await payments.handleStripeEvent(paidEvent("cs_test_1", "pi_late"));

    expect(stripe.refunds).toEqual([
      { paymentIntentId: "pi_late", amountMinor: 1_000, idempotencyKey: expect.stringMatching(/-unbookable$/) },
    ]);
    expect(await payment(confirmed.id)).toMatchObject({ status: "REFUNDED", refundedMinor: 1_000 });
    expect((await booking(confirmed.id)).status).toBe("EXPIRED");
  });

  it("refunds a cancellation made in good time in full", async () => {
    const confirmed = await bookAwaitingPayment();

    await payFor(confirmed.id);
    await request(app).patch(`/api/appointments/${confirmed.id}/cancel`).set(...authHeader(customer)).send({}).expect(200);
    await payments.handleBookingEvent(await outboxMessage(confirmed.id, "booking.cancelled"));
    await payments.handleBookingEvent(await outboxMessage(confirmed.id, "booking.cancelled"));

    expect(stripe.refunds).toEqual([
      { paymentIntentId: "pi_1", amountMinor: 1_000, idempotencyKey: expect.stringMatching(/-cancelled$/) },
    ]);
    expect(await payment(confirmed.id)).toMatchObject({ status: "REFUNDED", refundedMinor: 1_000 });
  });

  it("keeps a no-show's deposit by default, and refunds it when the business charges no fee", async () => {
    const markNoShow = async (bookingId: string) => {
      // Marking a no-show waits for the visit to start, so the test moves the booking there directly.
      await prisma.booking.updateMany({ where: { businessId: setup.business.id, id: bookingId }, data: { status: "NO_SHOW" } });
      await prisma.outboxEvent.create({
        data: {
          id: randomUUID(),
          businessId: setup.business.id,
          type: "booking.no_show",
          aggregateType: "booking",
          aggregateId: bookingId,
          payload: { bookingId, businessId: setup.business.id, status: "NO_SHOW", previousStatus: "CONFIRMED" },
        },
      });
      await payments.handleBookingEvent(await outboxMessage(bookingId, "booking.no_show"));
    };
    const kept = await bookAwaitingPayment("10:00");

    await payFor(kept.id);
    await markNoShow(kept.id);
    expect(stripe.refunds).toEqual([]);

    await request(app)
      .patch(`/api/businesses/${setup.business.id}/settings`)
      .set(...authHeader(setup.owner))
      .send({ noShowFee: "none" })
      .expect(200);
    await request(app)
      .patch(`/api/businesses/${setup.business.id}/settings`)
      .set(...authHeader(setup.owner))
      .send({ noShowFee: "sometimes" })
      .expect(422);

    const refunded = await bookAwaitingPayment("11:00");

    await payments.handleStripeEvent(paidEvent((await payment(refunded.id)).checkoutSessionId, "pi_2"));
    await markNoShow(refunded.id);

    expect(stripe.refunds).toEqual([
      { paymentIntentId: "pi_2", amountMinor: 1_000, idempotencyKey: expect.stringMatching(/-no-show$/) },
    ]);
    expect(await payment(refunded.id)).toMatchObject({ status: "REFUNDED", refundedMinor: 1_000 });
  });

  it("lets staff refund part of a payment, and records refunds made in Stripe", async () => {
    const confirmed = await bookAwaitingPayment();

    await payFor(confirmed.id);

    await expect(payments.refundForStaff(setup.business.id, confirmed.id, { amountMinor: 400 })).resolves.toMatchObject({
      status: "PARTIALLY_REFUNDED",
      refundedMinor: 400,
    });
    await expect(payments.refundForStaff(setup.business.id, confirmed.id, { amountMinor: 700 })).rejects.toMatchObject({
      statusCode: 422,
    });

    await payments.handleStripeEvent({
      id: "evt_charge_refunded",
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_1", amount_refunded: 1_000 } },
    });

    expect(await payment(confirmed.id)).toMatchObject({ status: "REFUNDED", refundedMinor: 1_000 });
    await expect(payments.refundForStaff(setup.business.id, confirmed.id, {})).rejects.toMatchObject({ statusCode: 409 });
  });

  it("sends a pay link from chat when the booking needs a deposit", async () => {
    const orchestration = new ChatOrchestrationService(new ScriptedProvider(), payments);
    const session = await request(app)
      .post("/api/chat/sessions")
      .set(...authHeader(customer))
      .send({ businessSlug: setup.business.slug })
      .expect(201);

    await orchestration.processMessage(customer.id, session.body.id, {
      clientMessageId: randomUUID(),
      content: "Haircut at 10",
      timeZone: "UTC",
      bookingDetails: { serviceId: setup.serviceId, scheduledDate: setup.day, scheduledTime: "10:00" },
    });

    const confirmed = await orchestration.confirmBooking(customer.id, session.body.id);
    const link = confirmed.assistantMessage.structuredData?.parts?.find(
      (part): part is Extract<ChatMessagePart, { type: "payment_link" }> => part.type === "payment_link",
    );

    expect(confirmed.appointment.status).toBe("PENDING_PAYMENT");
    expect(confirmed.assistantMessage.content).toMatch(/^Almost done: pay the \$10\.00 deposit to confirm Haircut/);
    expect(link).toMatchObject({ label: "Pay $10.00", url: "https://checkout.stripe.test/cs_test_1", amountMinor: 1_000 });
  });

  it("connects a business to Stripe and keeps its status current", async () => {
    await prisma.paymentAccount.deleteMany({ where: { businessId: setup.business.id } });

    const accounts = new PaymentAccountService(stripe);

    await expect(accounts.getAccount(setup.business.id)).resolves.toMatchObject({ available: true, connected: false });
    await expect(accounts.startOnboarding(setup.business.id, "owner@example.com")).resolves.toEqual({
      url: "https://connect.stripe.test/onboard/acct_1",
    });
    await expect(accounts.startOnboarding(setup.business.id, "owner@example.com")).resolves.toEqual({
      url: "https://connect.stripe.test/onboard/acct_1",
    });
    expect(stripe.accounts).toHaveLength(1);
    await expect(accounts.refreshAccount(setup.business.id)).resolves.toMatchObject({ connected: true, chargesEnabled: true });

    // Stripe's account.updated webhook, signed, through the real endpoint.
    const payload = JSON.stringify({
      id: "evt_account",
      type: "account.updated",
      data: { object: { id: "acct_1", charges_enabled: false, payouts_enabled: false, details_submitted: true } },
    });
    const now = Math.floor(Date.now() / 1_000);

    await request(app)
      .post(PAYMENT_CONSTANTS.WEBHOOK_PATH)
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", stripeSignatureHeader(payload, "whsec_other", now))
      .send(payload)
      .expect(400);
    await request(app)
      .post(PAYMENT_CONSTANTS.WEBHOOK_PATH)
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", stripeSignatureHeader(payload, "whsec_test_two", now))
      .send(payload)
      .expect(200);

    await expect(accounts.getAccount(setup.business.id)).resolves.toMatchObject({ chargesEnabled: false, detailsSubmitted: true });

    const owner = await request(app)
      .get(`/api/businesses/${setup.business.id}/payments/account`)
      .set(...authHeader(setup.owner))
      .expect(200);

    expect(owner.body).toMatchObject({ connected: true, chargesEnabled: false });
  });

  it("checks a service's payment settings", async () => {
    const base = `/api/businesses/${setup.business.id}/services/${setup.serviceId}`;

    const invalid = await request(app)
      .patch(base)
      .set(...authHeader(setup.owner))
      .send({ paymentMode: "DEPOSIT", depositMinor: null })
      .expect(422);

    expect(invalid.body.error.fieldErrors.paymentMode).toBeDefined();

    const saved = await request(app).patch(base).set(...authHeader(setup.owner)).send({ paymentMode: "FULL" }).expect(200);

    expect(saved.body).toMatchObject({ paymentMode: "FULL" });
  });
});
