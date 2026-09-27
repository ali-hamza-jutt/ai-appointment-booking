import { Controller, Get, Route, Security, SuccessResponse, Tags } from "@tsoa/runtime";

import { calendarConnectionService } from "../calendar-connection.service.js";
import type { CalendarProvidersResponse } from "../dto/calendar.dto.js";

@Route("calendar")
@Tags("Calendar sync")
@Security("jwt")
export class CalendarProviderController extends Controller {
  /** Which calendar providers this deployment can connect to. */
  @Get("providers")
  @SuccessResponse("200", "Providers retrieved")
  public getCalendarProviders(): CalendarProvidersResponse {
    return calendarConnectionService.providers();
  }
}
