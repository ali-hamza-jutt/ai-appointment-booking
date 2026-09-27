import { Router, type Request, type Response } from "express";

import { env } from "../../../config/env.js";
import { logger } from "../../../config/logger.js";
import { NOTIFICATION_CONSTANTS } from "../../../constants/app.constants.js";
import { isValidTwilioSignature } from "../../../infrastructure/messaging/twilio-signature.js";
import { notificationService } from "../notification.service.js";

function formFields(body: unknown): Record<string, string> {
  if (typeof body !== "object" || body === null) return {};

  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * Twilio's SMS delivery reports. Plain Express, because Twilio posts a
 * signed form rather than JSON; requests without a valid signature are
 * refused. Unconfigured, the route does not exist.
 */
export function createTwilioWebhookRouter(): Router {
  const router = Router();

  router.post(NOTIFICATION_CONSTANTS.TWILIO_STATUS_PATH, async (request: Request, response: Response) => {
    const authToken = env.TWILIO_AUTH_TOKEN;

    if (!authToken) {
      response.status(404).end();
      return;
    }

    const fields = formFields(request.body);
    const url = new URL(NOTIFICATION_CONSTANTS.TWILIO_STATUS_PATH, env.API_PUBLIC_URL).toString();

    if (!isValidTwilioSignature(authToken, url, fields, request.header("x-twilio-signature"))) {
      logger.warn("Rejected an SMS status callback with a bad signature");
      response.status(403).end();
      return;
    }

    const messageSid = fields.MessageSid ?? fields.SmsSid;
    const status = fields.MessageStatus ?? fields.SmsStatus;

    if (messageSid && status) {
      try {
        await notificationService.recordSmsStatus(messageSid, status, fields.ErrorCode);
      } catch (error) {
        // Twilio retries on a server error, which is what we want.
        logger.error({ err: error, messageSid }, "Recording an SMS status failed");
        response.status(500).end();
        return;
      }
    }

    response.status(204).end();
  });

  return router;
}
