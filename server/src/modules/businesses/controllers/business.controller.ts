import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Get,
  Patch,
  Path,
  Post,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import {
  getAuthenticatedUser,
  getBusinessRole,
} from "../../../utils/request.js";
import { businessService } from "../business.service.js";
import type {
  BusinessListResponse,
  BusinessResponse,
  CreateBusinessRequest,
  UpdateBusinessRequest,
  UpdateBusinessSettingsRequest,
} from "../dto/business.dto.js";

@Route("businesses")
@Tags("Businesses")
export class BusinessController extends Controller {
  /** Creates a business owned by the authenticated user, with a first location. */
  @Post()
  @Security("jwt")
  @SuccessResponse("201", "Business created")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(409, "Booking link is already in use")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createBusiness(
    @Request() request: ExpressRequest,
    @Body() body: CreateBusinessRequest,
  ): Promise<BusinessResponse> {
    this.setStatus(201);
    return businessService.createBusiness(getAuthenticatedUser(request).id, body);
  }

  /** Lists businesses the authenticated user belongs to, with their role. */
  @Get()
  @Security("jwt")
  @SuccessResponse("200", "Businesses retrieved")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  public listMyBusinesses(
    @Request() request: ExpressRequest,
  ): Promise<BusinessListResponse> {
    return businessService.listMyBusinesses(getAuthenticatedUser(request).id);
  }

  /** Returns one business the user is a member of. */
  @Get("{businessId}")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Business retrieved")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public getBusiness(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
  ): Promise<BusinessResponse> {
    return businessService.getBusiness(businessId, getBusinessRole(request));
  }

  /** Updates the business profile. */
  @Patch("{businessId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Business updated")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(404, "Business was not found")
  @Response<ApiErrorResponse>(409, "Booking link is already in use")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public updateBusiness(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Body() body: UpdateBusinessRequest,
  ): Promise<BusinessResponse> {
    return businessService.updateBusiness(
      businessId,
      getBusinessRole(request),
      body,
    );
  }

  /** Updates booking policies. Omitted fields keep their current value. */
  @Patch("{businessId}/settings")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Settings updated")
  @Response<ApiErrorResponse>(403, "Role does not allow this action")
  @Response<ApiErrorResponse>(404, "Business was not found")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public updateBusinessSettings(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Body() body: UpdateBusinessSettingsRequest,
  ): Promise<BusinessResponse> {
    return businessService.updateSettings(
      businessId,
      getBusinessRole(request),
      body,
    );
  }
}
