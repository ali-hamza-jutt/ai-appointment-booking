import { Router, type Request, type Response } from "express";

import { logger } from "../../../config/logger.js";
import { CALENDAR_CONSTANTS } from "../../../constants/app.constants.js";
import { calendarConnectionService } from "../calendar-connection.service.js";

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * The OAuth callback and the providers' change notifications. Plain Express:
 * the callback is a browser redirect, and the notifications are not JSON
 * API calls (Google sends only headers, Microsoft first sends a handshake).
 */
export function createCalendarRouter(): Router {
  const router = Router();

  router.get(CALENDAR_CONSTANTS.CALLBACK_PATH, async (request: Request, response: Response) => {
    const destination = await calendarConnectionService.complete({
      code: queryString(request.query.code),
      state: queryString(request.query.state),
      error: queryString(request.query.error),
    });

    response.redirect(302, destination);
  });

  router.post(CALENDAR_CONSTANTS.GOOGLE_WEBHOOK_PATH, async (request: Request, response: Response) => {
    try {
      await calendarConnectionService.handleGoogleNotification({
        channelId: request.header("x-goog-channel-id"),
        channelToken: request.header("x-goog-channel-token"),
        resourceState: request.header("x-goog-resource-state"),
      });
    } catch (error) {
      // Google retries on a server error, which is what we want.
      logger.error({ err: error }, "Handling a Google calendar notification failed");
      response.status(500).end();
      return;
    }

    response.status(200).end();
  });

  router.post(CALENDAR_CONSTANTS.MICROSOFT_WEBHOOK_PATH, async (request: Request, response: Response) => {
    const validationToken = queryString(request.query.validationToken);

    // Graph checks the address when a subscription is created by asking us to echo a token.
    if (validationToken) {
      response.status(200).type("text/plain").send(validationToken);
      return;
    }

    try {
      await calendarConnectionService.handleMicrosoftNotifications(request.body);
    } catch (error) {
      logger.error({ err: error }, "Handling a Microsoft calendar notification failed");
      response.status(500).end();
      return;
    }

    response.status(202).end();
  });

  return router;
}
