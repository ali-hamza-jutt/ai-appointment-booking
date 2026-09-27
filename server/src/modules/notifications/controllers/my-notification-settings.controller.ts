import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Get,
  Path,
  Put,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { getAuthenticatedUser } from "../../../utils/request.js";
import type {
  MyNotificationSettingsResponse,
  UpdateMyNotificationSettingRequest,
} from "../dto/notification.dto.js";
import { notificationSettingsService } from "../notification-settings.service.js";

@Route("me/notification-settings")
@Tags("Notifications")
@Security("jwt")
export class MyNotificationSettingsController extends Controller {
  /** Whether each business the user has booked with may email or text them. */
  @Get()
  @SuccessResponse("200", "Notification settings retrieved")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  public listMySettings(@Request() request: ExpressRequest): Promise<MyNotificationSettingsResponse> {
    return notificationSettingsService.listMySettings(getAuthenticatedUser(request).id);
  }

  /** Turns one business's emails or texts on or off. */
  @Put("{businessId}")
  @SuccessResponse("204", "Notification setting saved")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(404, "The user has not booked with this business")
  public async updateMySetting(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Body() body: UpdateMyNotificationSettingRequest,
  ): Promise<void> {
    await notificationSettingsService.updateMySetting(getAuthenticatedUser(request).id, businessId, body);
    this.setStatus(204);
  }
}
