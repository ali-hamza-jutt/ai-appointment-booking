import express, { Router, type Request, type Response } from "express";

import { logger } from "../../../config/logger.js";
import { PAYMENT_CONSTANTS } from "../../../constants/app.constants.js";
import { isValidStripeSignature } from "../../../integrations/stripe/stripe-signature.js";
import type { StripeEvent } from "../dto/payment.dto.js";
import { stripeWebhookSecrets } from "../payment-gateway.js";
import { paymentService } from "../payment.service.js";

function isStripeEvent(value: unknown): value is StripeEvent {
  if (typeof value !== "object" || value === null) return false;

  const event = value as Partial<StripeEvent>;

  return typeof event.id === "string" && typeof event.type === "string" && typeof event.data?.object === "object";
}

/**
 * Stripe's webhook. It reads the raw body, because the signature covers
 * the exact bytes Stripe sent; it must be mounted before the JSON parser.
 */
export function createStripeWebhookRouter(): Router {
  const router = Router();

  router.post(
    PAYMENT_CONSTANTS.WEBHOOK_PATH,
    express.raw({ type: "*/*", limit: "1mb" }),
    async (request: Request, response: Response) => {
      const secrets = stripeWebhookSecrets();

      if (secrets.length === 0) {
        response.status(404).end();
        return;
      }

      const payload = Buffer.isBuffer(request.body) ? request.body.toString("utf8") : "";
      const signature = request.header("stripe-signature");
      const now = Math.floor(Date.now() / 1_000);
      const genuine = secrets.some((secret) =>
        isValidStripeSignature(payload, signature, secret, now, PAYMENT_CONSTANTS.WEBHOOK_TOLERANCE_SECONDS),
      );

      if (!genuine) {
        logger.warn("Rejected a Stripe webhook with a bad signature");
        response.status(400).end();
        return;
      }

      let event: unknown;

      try {
        event = JSON.parse(payload);
      } catch {
        response.status(400).end();
        return;
      }

      if (!isStripeEvent(event)) {
        response.status(400).end();
        return;
      }

      try {
        await paymentService.handleStripeEvent(event);
      } catch (error) {
        // Stripe retries on a server error, and the event is released for that retry.
        logger.error({ err: error, eventId: event.id, type: event.type }, "Handling a Stripe event failed");
        response.status(500).end();
        return;
      }

      response.status(200).json({ received: true });
    },
  );

  return router;
}
