import { Controller, Get, Path, Response, Route, Security, SuccessResponse, Tags } from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import type { BusinessWaitlistListResponse } from "../dto/waitlist.dto.js";
import { waitlistService } from "../waitlist.service.js";

@Route("businesses/{businessId}/waitlist")
@Tags("Waitlist")
export class BusinessWaitlistController extends Controller {
  /** Customers waiting for a time, in the order they joined, with any time held for them. */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Waitlist retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listBusinessWaitlist(@Path() businessId: string): Promise<BusinessWaitlistListResponse> {
    return waitlistService.listForBusiness(businessId);
  }
}
