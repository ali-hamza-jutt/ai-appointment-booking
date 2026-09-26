import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { availabilityService } from "../availability.service.js";
import type {
  ClosureListResponse,
  ClosureResponse,
  CreateClosureRequest,
} from "../dto/availability.dto.js";

@Route("businesses/{businessId}/closures")
@Tags("Availability")
export class ClosureController extends Controller {
  /** Lists today's and future closure dates. */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Closures retrieved")
  public listClosures(@Path() businessId: string): Promise<ClosureListResponse> {
    return availabilityService.listClosures(businessId);
  }

  /** Closes the whole business for one local date. */
  @Post()
  @Security("jwt", ["business:manage"])
  @SuccessResponse("201", "Closure added")
  @Response<ApiErrorResponse>(409, "Already closed on this date")
  @Response<ApiErrorResponse>(422, "Date is invalid")
  public async createClosure(
    @Path() businessId: string,
    @Body() body: CreateClosureRequest,
  ): Promise<ClosureResponse> {
    this.setStatus(201);
    return availabilityService.createClosure(businessId, body);
  }

  /** Reopens a closed date. */
  @Delete("{closureId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("204", "Closure removed")
  @Response<ApiErrorResponse>(404, "Closure was not found")
  public async deleteClosure(
    @Path() businessId: string,
    @Path() closureId: string,
  ): Promise<void> {
    await availabilityService.deleteClosure(businessId, closureId);
    this.setStatus(204);
  }
}
