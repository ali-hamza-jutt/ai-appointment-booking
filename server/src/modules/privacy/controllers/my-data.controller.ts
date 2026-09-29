import type { Request as ExpressRequest } from "express";
import { Body, Controller, Get, Post, Request, Response, Route, Security, SuccessResponse, Tags } from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { getAuthenticatedUser } from "../../../utils/request.js";
import { clearRefreshCookie } from "../../auth/auth-cookies.js";
import type { DeleteAccountRequest, MyDataExport } from "../dto/privacy.dto.js";
import { privacyService } from "../privacy.service.js";

/** The signed-in person's own data (GDPR access and erasure). */
@Route("me/data")
@Tags("Privacy")
@Security("jwt")
export class MyDataController extends Controller {
  /** Everything BookWise holds about you, at every business you booked with. */
  @Get("export")
  @SuccessResponse("200", "Your data")
  public exportMyData(@Request() request: ExpressRequest): Promise<MyDataExport> {
    return privacyService.exportMine(getAuthenticatedUser(request).id);
  }

  /**
   * Deletes your account and erases your details at every business. Your past
   * bookings stay with each business, without your name or contact details.
   */
  @Post("delete-account")
  @SuccessResponse("204", "Account deleted")
  @Response<ApiErrorResponse>(409, "Upcoming appointments, or the only owner of a business")
  @Response<ApiErrorResponse>(422, "The email typed doesn't match")
  public async deleteMyAccount(@Request() request: ExpressRequest, @Body() body: DeleteAccountRequest): Promise<void> {
    await privacyService.deleteMyAccount(getAuthenticatedUser(request).id, body.confirmEmail);
    clearRefreshCookie(request);
    this.setStatus(204);
  }
}
