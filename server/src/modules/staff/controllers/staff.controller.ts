import {
  Body,
  Controller,
  Get,
  Patch,
  Path,
  Post,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import type {
  CreateStaffRequest,
  StaffListResponse,
  StaffResponse,
  UpdateStaffRequest,
} from "../dto/staff.dto.js";
import { staffService } from "../staff.service.js";

@Route("businesses/{businessId}/staff")
@Tags("Staff")
export class StaffController extends Controller {
  /** Lists staff members with the services they offer and where they work. */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Staff retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listStaff(@Path() businessId: string): Promise<StaffListResponse> {
    return staffService.listStaff(businessId);
  }

  /** Returns one staff member. */
  @Get("{staffId}")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Staff member retrieved")
  @Response<ApiErrorResponse>(404, "Staff member was not found")
  public getStaff(
    @Path() businessId: string,
    @Path() staffId: string,
  ): Promise<StaffResponse> {
    return staffService.getStaff(businessId, staffId);
  }

  /** Adds a staff member, optionally linked to a team member's account. */
  @Post()
  @Security("jwt", ["business:manage"])
  @SuccessResponse("201", "Staff member created")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(409, "Team member already has a staff profile")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createStaff(
    @Path() businessId: string,
    @Body() body: CreateStaffRequest,
  ): Promise<StaffResponse> {
    this.setStatus(201);
    return staffService.createStaff(businessId, body);
  }

  /** Updates a staff member; `services` and `locationIds` replace the full lists. */
  @Patch("{staffId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Staff member updated")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(404, "Staff member was not found")
  @Response<ApiErrorResponse>(409, "Team member already has a staff profile")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public updateStaff(
    @Path() businessId: string,
    @Path() staffId: string,
    @Body() body: UpdateStaffRequest,
  ): Promise<StaffResponse> {
    return staffService.updateStaff(businessId, staffId, body);
  }
}
