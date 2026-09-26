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
import { catalogService } from "../catalog.service.js";
import type {
  CreateServiceRequest,
  ServiceListResponse,
  ServiceResponse,
  UpdateServiceRequest,
} from "../dto/catalog.dto.js";

@Route("businesses/{businessId}/services")
@Tags("Catalog")
export class ServiceController extends Controller {
  /** Lists every service, including inactive ones. */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Services retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listServices(@Path() businessId: string): Promise<ServiceListResponse> {
    return catalogService.listServices(businessId);
  }

  /** Returns one service. */
  @Get("{serviceId}")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Service retrieved")
  @Response<ApiErrorResponse>(404, "Service was not found")
  public getService(
    @Path() businessId: string,
    @Path() serviceId: string,
  ): Promise<ServiceResponse> {
    return catalogService.getService(businessId, serviceId);
  }

  /** Creates a bookable service priced in the business currency. */
  @Post()
  @Security("jwt", ["business:manage"])
  @SuccessResponse("201", "Service created")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(404, "Category or location was not found")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createService(
    @Path() businessId: string,
    @Body() body: CreateServiceRequest,
  ): Promise<ServiceResponse> {
    this.setStatus(201);
    return catalogService.createService(businessId, body);
  }

  /** Updates a service. Set `isActive` to false to archive it. */
  @Patch("{serviceId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Service updated")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(404, "Service, category or location was not found")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public updateService(
    @Path() businessId: string,
    @Path() serviceId: string,
    @Body() body: UpdateServiceRequest,
  ): Promise<ServiceResponse> {
    return catalogService.updateService(businessId, serviceId, body);
  }
}
