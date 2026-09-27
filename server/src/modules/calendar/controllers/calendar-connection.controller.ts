import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { getAuthenticatedUser, getBusinessRole } from "../../../utils/request.js";
import { calendarConnectionService } from "../calendar-connection.service.js";
import type {
  CalendarConnectionListResponse,
  StartCalendarConnectionRequest,
  StartCalendarConnectionResponse,
} from "../dto/calendar.dto.js";

function caller(request: ExpressRequest) {
  return { id: getAuthenticatedUser(request).id, role: getBusinessRole(request) };
}

@Route("businesses/{businessId}")
@Tags("Calendar sync")
export class CalendarConnectionController extends Controller {
  /** Every staff calendar connected at the business. */
  @Get("calendar-connections")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Calendar connections retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listCalendarConnections(@Path() businessId: string): Promise<CalendarConnectionListResponse> {
    return calendarConnectionService.listConnections(businessId);
  }

  /**
   * Starts connecting a staff member's Google or Microsoft calendar. Send the
   * browser to the returned URL; it comes back to the staff page when done.
   * Owners and managers can connect anyone; staff only themselves.
   */
  @Post("staff/{staffId}/calendar-connection")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Authorization URL created")
  @Response<ApiErrorResponse>(403, "Not allowed to change this staff member's calendar")
  @Response<ApiErrorResponse>(404, "Business or staff member was not found")
  @Response<ApiErrorResponse>(503, "Calendar sync with this provider is not configured")
  public startCalendarConnection(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Path() staffId: string,
    @Body() body: StartCalendarConnectionRequest,
  ): Promise<StartCalendarConnectionResponse> {
    return calendarConnectionService.start(businessId, staffId, caller(request), body.provider);
  }

  /** Disconnects the calendar: its busy times stop blocking bookings and no new events are written. */
  @Delete("staff/{staffId}/calendar-connection")
  @Security("jwt", ["business:read"])
  @SuccessResponse("204", "Calendar disconnected")
  @Response<ApiErrorResponse>(403, "Not allowed to change this staff member's calendar")
  @Response<ApiErrorResponse>(404, "No calendar is connected")
  public async disconnectCalendar(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Path() staffId: string,
  ): Promise<void> {
    await calendarConnectionService.disconnect(businessId, staffId, caller(request));
    this.setStatus(204);
  }

  /** Checks the calendar for changes now instead of waiting for the next sync. */
  @Post("staff/{staffId}/calendar-connection/sync")
  @Security("jwt", ["business:read"])
  @SuccessResponse("202", "Sync requested")
  @Response<ApiErrorResponse>(403, "Not allowed to change this staff member's calendar")
  @Response<ApiErrorResponse>(404, "No calendar is connected")
  public async syncCalendar(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Path() staffId: string,
  ): Promise<void> {
    await calendarConnectionService.requestSync(businessId, staffId, caller(request));
    this.setStatus(202);
  }
}
