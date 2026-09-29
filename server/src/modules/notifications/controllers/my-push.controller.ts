import type { Request as ExpressRequest } from "express";
import { Body, Controller, Get, Post, Request, Response, Route, Security, SuccessResponse, Tags } from "@tsoa/runtime";

import { pushSender } from "../../../infrastructure/messaging/push-sender.js";
import type { ApiErrorResponse } from "../../../models/api-error.js";
import { getAuthenticatedUser } from "../../../utils/request.js";
import { throwRequestValidationError } from "../../../utils/validation.js";
import { pushSubscriptionDal } from "../dal/push-subscription.dal.js";
import type {
  PushSettingsResponse,
  RemovePushSubscriptionRequest,
  SavePushSubscriptionRequest,
} from "../dto/notification.dto.js";

function assertPushEndpoint(endpoint: string): void {
  try {
    if (new URL(endpoint).protocol === "https:") return;
  } catch {
    // Falls through to the validation error.
  }

  throwRequestValidationError("endpoint", "Endpoint must be the browser's https push URL");
}

/** Browser notifications: which browsers of the signed-in account get booking messages. */
@Route("me/push")
@Tags("Notifications")
@Security("jwt")
export class MyPushController extends Controller {
  /** Whether push is available, the key to subscribe with, and how many browsers are on. */
  @Get()
  public async getPushSettings(@Request() request: ExpressRequest): Promise<PushSettingsResponse> {
    return {
      enabled: pushSender.isAvailable,
      publicKey: pushSender.publicKey,
      browsers: await pushSubscriptionDal.countForUser(getAuthenticatedUser(request).id),
    };
  }

  /** Turns notifications on for this browser. Saving the same browser again replaces its keys. */
  @Post("subscriptions")
  @SuccessResponse("204", "Browser saved")
  @Response<ApiErrorResponse>(422, "Not a push subscription")
  public async savePushSubscription(
    @Request() request: ExpressRequest,
    @Body() body: SavePushSubscriptionRequest,
  ): Promise<void> {
    assertPushEndpoint(body.endpoint);
    await pushSubscriptionDal.save(getAuthenticatedUser(request).id, {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    this.setStatus(204);
  }

  /** Turns notifications off for this browser. */
  @Post("subscriptions/remove")
  @SuccessResponse("204", "Browser removed")
  public async removePushSubscription(
    @Request() request: ExpressRequest,
    @Body() body: RemovePushSubscriptionRequest,
  ): Promise<void> {
    await pushSubscriptionDal.remove(getAuthenticatedUser(request).id, body.endpoint);
    this.setStatus(204);
  }
}
