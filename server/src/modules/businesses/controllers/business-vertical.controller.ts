import { Controller, Get, Route, SuccessResponse, Tags } from "@tsoa/runtime";

import { businessService } from "../business.service.js";
import type { BusinessVerticalListResponse } from "../dto/business.dto.js";

@Route("business-verticals")
@Tags("Businesses")
export class BusinessVerticalController extends Controller {
  /** Lists supported business types with their terminology and starter services. */
  @Get()
  @SuccessResponse("200", "Verticals retrieved")
  public listBusinessVerticals(): BusinessVerticalListResponse {
    return businessService.listVerticals();
  }
}
