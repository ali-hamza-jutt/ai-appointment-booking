import { Router, type Request, type Response } from "express";

import { env } from "../../../config/env.js";
import { logger } from "../../../config/logger.js";
import { MESSAGING_CONSTANTS } from "../../../constants/app.constants.js";
import { isValidTwilioSignature } from "../../../infrastructure/messaging/twilio-signature.js";
import { messagingDal } from "../dal/messaging.dal.js";
import type { InboundMessageJobData, MessagingChannel, ReminderReplyJobData } from "../dto/messaging.dto.js";
import { isCancelReply } from "../messaging.service.js";
import { messagingQueue } from "../messaging.queue.js";

/** An empty TwiML answer: the reply is sent separately once the worker has it. */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function formFields(body: unknown): Record<string, string> {
  if (typeof body !== "object" || body === null) return {};

  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * Incoming SMS and WhatsApp messages for every business, routed by the
 * number they were sent to. Only Twilio-signed requests count, and the
 * message is queued so Twilio gets its answer well within its timeout.
 */
export function createTwilioInboundRouter(
  enqueue: (job: InboundMessageJobData) => Promise<void> = (job) => messagingQueue.enqueue(job),
  enqueueReminderReply: (job: ReminderReplyJobData) => Promise<void> = (job) => messagingQueue.enqueueReminderReply(job),
): Router {
  const router = Router();

  router.post(MESSAGING_CONSTANTS.INBOUND_PATH, async (request: Request, response: Response) => {
    const authToken = env.TWILIO_AUTH_TOKEN;

    if (!authToken) {
      response.status(404).end();
      return;
    }

    const fields = formFields(request.body);
    const url = new URL(MESSAGING_CONSTANTS.INBOUND_PATH, env.API_PUBLIC_URL).toString();

    if (!isValidTwilioSignature(authToken, url, fields, request.header("x-twilio-signature"))) {
      logger.warn("Rejected an incoming message with a bad signature");
      response.status(403).end();
      return;
    }

    const { From: from, To: to, MessageSid: messageSid } = fields;

    try {
      const number = to ? await messagingDal.findByAddress(to) : null;

      if (number && from && messageSid) {
        await enqueue({
          businessId: number.businessId,
          channel: number.channel as MessagingChannel,
          from,
          to: number.address,
          body: fields.Body ?? "",
          messageSid,
          profileName: fields.ProfileName ?? null,
        });
      } else if (to && from && messageSid && isCancelReply(fields.Body ?? "")) {
        // Reminders go out from the platform's number; "C" there cancels the reminded booking.
        await enqueueReminderReply({ from, to, messageSid });
      } else {
        logger.warn({ to }, "Ignored a message to a number no business has connected");
      }
    } catch (error) {
      // Twilio retries on a server error; the job id keeps a retry from doubling up.
      logger.error({ err: error }, "Queueing an incoming message failed");
      response.status(500).end();
      return;
    }

    response.status(200).type("text/xml").send(EMPTY_TWIML);
  });

  return router;
}
