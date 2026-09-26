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
  CreateResourceRequest,
  ResourceListResponse,
  ResourceResponse,
  UpdateResourceRequest,
} from "../dto/staff.dto.js";
import { resourceService } from "../resource.service.js";

@Route("businesses/{businessId}/resources")
@Tags("Staff")
export class ResourceController extends Controller {
  /** Lists rooms, chairs and equipment with the services that need them. */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Resources retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listResources(@Path() businessId: string): Promise<ResourceListResponse> {
    return resourceService.listResources(businessId);
  }

  /** Adds a resource at a location. */
  @Post()
  @Security("jwt", ["business:manage"])
  @SuccessResponse("201", "Resource created")
  @Response<ApiErrorResponse>(404, "Location was not found")
  @Response<ApiErrorResponse>(409, "Resource name already used at this location")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createResource(
    @Path() businessId: string,
    @Body() body: CreateResourceRequest,
  ): Promise<ResourceResponse> {
    this.setStatus(201);
    return resourceService.createResource(businessId, body);
  }

  /** Updates a resource; `serviceIds` replaces the full list. */
  @Patch("{resourceId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Resource updated")
  @Response<ApiErrorResponse>(404, "Resource or location was not found")
  @Response<ApiErrorResponse>(409, "Resource name already used at this location")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public updateResource(
    @Path() businessId: string,
    @Path() resourceId: string,
    @Body() body: UpdateResourceRequest,
  ): Promise<ResourceResponse> {
    return resourceService.updateResource(businessId, resourceId, body);
  }
}
