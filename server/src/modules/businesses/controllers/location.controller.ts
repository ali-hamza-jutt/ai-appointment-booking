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
import { businessService } from "../business.service.js";
import type {
  CreateLocationRequest,
  LocationListResponse,
  LocationResponse,
  UpdateLocationRequest,
} from "../dto/business.dto.js";

@Route("businesses/{businessId}/locations")
@Tags("Businesses")
export class LocationController extends Controller {
  /** Lists the business's locations, including inactive ones. */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Locations retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listLocations(@Path() businessId: string): Promise<LocationListResponse> {
    return businessService.listLocations(businessId);
  }

  /** Adds a location to the business. */
  @Post()
  @Security("jwt", ["business:manage"])
  @SuccessResponse("201", "Location created")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createLocation(
    @Path() businessId: string,
    @Body() body: CreateLocationRequest,
  ): Promise<LocationResponse> {
    this.setStatus(201);
    return businessService.createLocation(businessId, body);
  }

  /** Updates or deactivates a location. */
  @Patch("{locationId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Location updated")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(404, "Location was not found")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public updateLocation(
    @Path() businessId: string,
    @Path() locationId: string,
    @Body() body: UpdateLocationRequest,
  ): Promise<LocationResponse> {
    return businessService.updateLocation(businessId, locationId, body);
  }
}
