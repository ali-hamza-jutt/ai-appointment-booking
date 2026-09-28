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
import type {
  AddAllowedOriginRequest,
  AllowedOriginListResponse,
  AllowedOriginResponse,
} from "../dto/public-booking.dto.js";
import { publicBookingService } from "../public-booking.service.js";

@Route("businesses/{businessId}/allowed-origins")
@Tags("Businesses")
export class AllowedOriginController extends Controller {
  /** Websites allowed to embed the booking widget. */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Allowed websites retrieved")
  public listAllowedOrigins(@Path() businessId: string): Promise<AllowedOriginListResponse> {
    return publicBookingService.listOrigins(businessId);
  }

  /** Allows a website to embed the booking widget. Adding one twice returns the first. */
  @Post()
  @Security("jwt", ["business:manage"])
  @SuccessResponse("201", "Website allowed")
  @Response<ApiErrorResponse>(409, "Too many websites")
  @Response<ApiErrorResponse>(422, "Not a website address")
  public async addAllowedOrigin(
    @Path() businessId: string,
    @Body() body: AddAllowedOriginRequest,
  ): Promise<AllowedOriginResponse> {
    this.setStatus(201);
    return publicBookingService.addOrigin(businessId, body.origin);
  }

  @Delete("{originId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("204", "Website removed")
  @Response<ApiErrorResponse>(404, "Website was not on the list")
  public async removeAllowedOrigin(@Path() businessId: string, @Path() originId: string): Promise<void> {
    await publicBookingService.removeOrigin(businessId, originId);
    this.setStatus(204);
  }
}
