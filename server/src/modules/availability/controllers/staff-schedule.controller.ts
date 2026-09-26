import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { availabilityService } from "../availability.service.js";
import type {
  CreateTimeOffRequest,
  ReplaceWorkingHoursRequest,
  TimeOffListResponse,
  TimeOffResponse,
  WorkingHoursListResponse,
} from "../dto/availability.dto.js";

@Route("businesses/{businessId}/staff/{staffId}")
@Tags("Availability")
export class StaffScheduleController extends Controller {
  /** Returns the staff member's weekly working hours. */
  @Get("working-hours")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Working hours retrieved")
  @Response<ApiErrorResponse>(404, "Staff member was not found")
  public listWorkingHours(
    @Path() businessId: string,
    @Path() staffId: string,
  ): Promise<WorkingHoursListResponse> {
    return availabilityService.listWorkingHours(businessId, staffId);
  }

  /** Replaces the full weekly schedule. Several rows per day model breaks. */
  @Put("working-hours")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Working hours saved")
  @Response<ApiErrorResponse>(404, "Staff member was not found")
  @Response<ApiErrorResponse>(422, "Hours are invalid or overlap")
  public replaceWorkingHours(
    @Path() businessId: string,
    @Path() staffId: string,
    @Body() body: ReplaceWorkingHoursRequest,
  ): Promise<WorkingHoursListResponse> {
    return availabilityService.replaceWorkingHours(businessId, staffId, body);
  }

  /** Lists current and upcoming time off. */
  @Get("time-off")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Time off retrieved")
  @Response<ApiErrorResponse>(404, "Staff member was not found")
  public listTimeOff(
    @Path() businessId: string,
    @Path() staffId: string,
  ): Promise<TimeOffListResponse> {
    return availabilityService.listTimeOff(businessId, staffId);
  }

  /** Blocks a period, such as a holiday or appointment, for one person. */
  @Post("time-off")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("201", "Time off added")
  @Response<ApiErrorResponse>(404, "Staff member was not found")
  @Response<ApiErrorResponse>(422, "Time range is invalid")
  public async createTimeOff(
    @Path() businessId: string,
    @Path() staffId: string,
    @Body() body: CreateTimeOffRequest,
  ): Promise<TimeOffResponse> {
    this.setStatus(201);
    return availabilityService.createTimeOff(businessId, staffId, body);
  }

  /** Removes a time-off entry. */
  @Delete("time-off/{timeOffId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("204", "Time off removed")
  @Response<ApiErrorResponse>(404, "Time off was not found")
  public async deleteTimeOff(
    @Path() businessId: string,
    @Path() staffId: string,
    @Path() timeOffId: string,
  ): Promise<void> {
    await availabilityService.deleteTimeOff(businessId, staffId, timeOffId);
    this.setStatus(204);
  }
}
