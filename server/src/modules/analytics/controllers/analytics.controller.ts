import { Controller, Get, Path, Query, Response, Route, Security, SuccessResponse, Tags } from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { analyticsService } from "../analytics.service.js";
import type { AnalyticsResponse } from "../dto/analytics.dto.js";

@Route("businesses/{businessId}/analytics")
@Tags("Businesses")
export class AnalyticsController extends Controller {
  /**
   * Bookings, revenue, cancellations, no-shows, busiest hours, provider
   * utilisation and how the assistant is doing, between two local dates
   * (inclusive, at most 92 days). Defaults to the last 30 days.
   * @param from First local date, YYYY-MM-DD.
   * @param to Last local date, YYYY-MM-DD.
   */
  @Get()
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Analytics retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  @Response<ApiErrorResponse>(422, "Dates are invalid or too far apart")
  public getAnalytics(
    @Path() businessId: string,
    @Query() from?: string,
    @Query() to?: string,
  ): Promise<AnalyticsResponse> {
    return analyticsService.getAnalytics(businessId, from, to);
  }
}
