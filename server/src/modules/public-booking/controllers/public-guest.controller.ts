import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Request,
  Response,
  Route,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { respondWithSession, userAgentOf } from "../../auth/auth-cookies.js";
import type { AuthResponse } from "../../auth/dto/auth.dto.js";
import type { EmbedPolicyResponse, GuestCodeRequest, GuestVerifyRequest } from "../dto/public-booking.dto.js";
import { publicBookingService } from "../public-booking.service.js";

@Route("public/{slug}")
@Tags("Public booking")
export class PublicGuestController extends Controller {
  /** Emails a 6-digit code so someone without an account can book as a guest. */
  @Post("guest/code")
  @SuccessResponse("202", "Code sent")
  @Response<ApiErrorResponse>(403, "The business only takes bookings from accounts")
  @Response<ApiErrorResponse>(404, "Business was not found")
  @Response<ApiErrorResponse>(429, "A code was sent less than a minute ago")
  public async sendGuestCode(@Path() slug: string, @Body() body: GuestCodeRequest): Promise<void> {
    await publicBookingService.sendGuestCode(slug, body.email);
    this.setStatus(202);
  }

  /**
   * Confirms the emailed code and signs the guest in, creating an account
   * for a new email. The session ends with the browser session.
   */
  @Post("guest/verify")
  @SuccessResponse("200", "Signed in")
  @Response<ApiErrorResponse>(400, "Code is incorrect or expired")
  @Response<ApiErrorResponse>(403, "The business only takes bookings from accounts")
  @Response<ApiErrorResponse>(404, "Business was not found")
  @Response<ApiErrorResponse>(422, "Name, email or phone is invalid")
  public async verifyGuest(
    @Path() slug: string,
    @Body() body: GuestVerifyRequest,
    @Request() request: ExpressRequest,
  ): Promise<AuthResponse> {
    return respondWithSession(
      request,
      await publicBookingService.verifyGuest(slug, body, { userAgent: userAgentOf(request) }),
    );
  }

  /** The websites allowed to embed this business's booking widget. */
  @Get("embed")
  @SuccessResponse("200", "Embed policy retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public getEmbedPolicy(@Path() slug: string): Promise<EmbedPolicyResponse> {
    return publicBookingService.getEmbedPolicy(slug);
  }
}
