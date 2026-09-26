import {
  Controller,
  Get,
  Path,
  Query,
  Response,
  Route,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { availabilityService } from "../availability.service.js";
import type { AvailabilityResponse } from "../dto/availability.dto.js";

@Route("public/{slug}/availability")
@Tags("Public booking")
export class PublicAvailabilityController extends Controller {
  /**
   * Bookable start times for a service, grouped by local date.
   * @param from First local date (YYYY-MM-DD) in `tz`.
   * @param to Last local date (YYYY-MM-DD) in `tz`, at most 31 days after `from`.
   * @param tz IANA time zone for dates and times; defaults to the business zone.
   * @param staffId Only this staff member; omit for any available person.
   */
  @Get()
  @SuccessResponse("200", "Availability retrieved")
  @Response<ApiErrorResponse>(404, "Business or service was not found")
  @Response<ApiErrorResponse>(422, "Query is invalid")
  public getPublicAvailability(
    @Path() slug: string,
    @Query() serviceId: string,
    @Query() from: string,
    @Query() to: string,
    @Query() staffId?: string,
    @Query() tz?: string,
  ): Promise<AvailabilityResponse> {
    return availabilityService.getPublicAvailability(slug, {
      serviceId,
      from,
      to,
      ...(staffId ? { staffId } : {}),
      ...(tz ? { timeZone: tz } : {}),
    });
  }
}
