import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Put,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import type {
  BookingNotificationListResponse,
  NotificationTemplateListResponse,
  NotificationTemplateResponse,
  UpdateNotificationTemplateRequest,
} from "../dto/notification.dto.js";
import { notificationSettingsService } from "../notification-settings.service.js";

@Route("businesses/{businessId}")
@Tags("Notifications")
export class NotificationTemplateController extends Controller {
  /** Every message the business sends, in its own wording where it has one. */
  @Get("notification-templates")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Templates retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listTemplates(@Path() businessId: string): Promise<NotificationTemplateListResponse> {
    return notificationSettingsService.listTemplates(businessId);
  }

  /**
   * Replaces the wording of one message.
   * @param channel EMAIL or SMS
   * @param kind BOOKING_CONFIRMED, BOOKING_REQUESTED, BOOKING_RESCHEDULED, BOOKING_CANCELLED or BOOKING_REMINDER
   */
  @Put("notification-templates/{channel}/{kind}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Template saved")
  @Response<ApiErrorResponse>(404, "Business or template was not found")
  @Response<ApiErrorResponse>(422, "Template text or placeholders are invalid")
  public updateTemplate(
    @Path() businessId: string,
    @Path() channel: string,
    @Path() kind: string,
    @Body() body: UpdateNotificationTemplateRequest,
  ): Promise<NotificationTemplateResponse> {
    return notificationSettingsService.updateTemplate(businessId, channel, kind, body);
  }

  /** Goes back to the built-in wording for one message. */
  @Delete("notification-templates/{channel}/{kind}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("204", "Template reset")
  @Response<ApiErrorResponse>(404, "Business or template was not found")
  public async resetTemplate(
    @Path() businessId: string,
    @Path() channel: string,
    @Path() kind: string,
  ): Promise<void> {
    await notificationSettingsService.resetTemplate(businessId, channel, kind);
    this.setStatus(204);
  }

  /** The emails and texts sent about one booking, newest first. */
  @Get("bookings/{bookingId}/notifications")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Notifications retrieved")
  @Response<ApiErrorResponse>(404, "Business or booking was not found")
  public listBookingNotifications(
    @Path() businessId: string,
    @Path() bookingId: string,
  ): Promise<BookingNotificationListResponse> {
    return notificationSettingsService.listForBooking(businessId, bookingId);
  }
}
