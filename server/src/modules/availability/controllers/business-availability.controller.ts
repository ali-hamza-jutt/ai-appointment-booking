import {
  Controller,
  Get,
  Path,
  Query,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { availabilityService } from "../availability.service.js";
import type { AvailabilityResponse } from "../dto/availability.dto.js";

@Route("businesses/{businessId}/availability")
@Tags("Availability")
export class BusinessAvailabilityController extends Controller {
  /**
   * Open times for staff taking a booking. Unlike the public view it ignores
   * minimum notice, the booking window and the online-bookable flag.
   * @param from First local date (YYYY-MM-DD) in `tz`.
   * @param to Last local date (YYYY-MM-DD) in `tz`.
   */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Availability retrieved")
  @Response<ApiErrorResponse>(404, "Service was not found")
  @Response<ApiErrorResponse>(422, "Query is invalid")
  public getBusinessAvailability(
    @Path() businessId: string,
    @Query() serviceId: string,
    @Query() from: string,
    @Query() to: string,
    @Query() staffId?: string,
    @Query() tz?: string,
  ): Promise<AvailabilityResponse> {
    return availabilityService.getBusinessAvailability(businessId, {
      serviceId,
      from,
      to,
      ...(staffId ? { staffId } : {}),
      ...(tz ? { timeZone: tz } : {}),
    });
  }
}
