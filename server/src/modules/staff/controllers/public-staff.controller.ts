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
import type { PublicStaffListResponse } from "../dto/staff.dto.js";
import { staffService } from "../staff.service.js";

@Route("public/{slug}/staff")
@Tags("Public booking")
export class PublicStaffController extends Controller {
  /** Lists active staff, optionally only those who offer `serviceId`. */
  @Get()
  @SuccessResponse("200", "Staff retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  @Response<ApiErrorResponse>(422, "Service ID is invalid")
  public listPublicStaff(
    @Path() slug: string,
    @Query() serviceId?: string,
  ): Promise<PublicStaffListResponse> {
    return staffService.listPublicStaff(slug, serviceId);
  }
}
