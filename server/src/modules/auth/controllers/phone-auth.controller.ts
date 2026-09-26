import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Post,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { getAuthenticatedUser } from "../../../utils/request.js";
import { respondWithSession, userAgentOf } from "../auth-cookies.js";
import type {
  AuthResponse,
  AuthUserResponse,
  PhoneCodeRequest,
  PhoneSignInRequest,
  PhoneVerifyRequest,
} from "../dto/auth.dto.js";
import { phoneAuthService } from "../phone-auth.service.js";

@Route("auth/phone")
@Tags("Authentication")
export class PhoneAuthController extends Controller {
  /** Texts a code to confirm a phone number for the signed-in account. */
  @Post("link/code")
  @Security("jwt")
  @SuccessResponse("202", "Code sent")
  @Response<ApiErrorResponse>(409, "Number belongs to another account")
  @Response<ApiErrorResponse>(429, "A code was sent recently")
  @Response<ApiErrorResponse>(503, "Text messages are unavailable")
  public async sendPhoneLinkCode(
    @Body() body: PhoneCodeRequest,
    @Request() request: ExpressRequest,
  ): Promise<void> {
    await phoneAuthService.sendLinkCode(getAuthenticatedUser(request).id, body.phone);
    this.setStatus(202);
  }

  /** Links the phone number once the texted code is confirmed. */
  @Post("link/verify")
  @Security("jwt")
  @SuccessResponse("200", "Phone linked")
  @Response<ApiErrorResponse>(400, "Code is incorrect or expired")
  @Response<ApiErrorResponse>(409, "Number belongs to another account")
  public confirmPhoneLink(
    @Body() body: PhoneVerifyRequest,
    @Request() request: ExpressRequest,
  ): Promise<AuthUserResponse> {
    return phoneAuthService.confirmLink(getAuthenticatedUser(request).id, body.phone, body.code);
  }

  /** Texts a sign-in code if the number belongs to an account; the response is the same either way. */
  @Post("sign-in/code")
  @SuccessResponse("202", "Request accepted")
  @Response<ApiErrorResponse>(429, "Too many requests")
  @Response<ApiErrorResponse>(503, "Text messages are unavailable")
  public async sendPhoneSignInCode(@Body() body: PhoneCodeRequest): Promise<void> {
    await phoneAuthService.sendSignInCode(body.phone);
    this.setStatus(202);
  }

  /** Signs in with a texted code. */
  @Post("sign-in")
  @SuccessResponse("200", "Authenticated")
  @Response<ApiErrorResponse>(400, "Code is incorrect or expired")
  @Response<ApiErrorResponse>(429, "Too many requests")
  public async signInWithPhone(
    @Body() body: PhoneSignInRequest,
    @Request() request: ExpressRequest,
  ): Promise<AuthResponse> {
    return respondWithSession(
      request,
      await phoneAuthService.signIn(body.phone, body.code, {
        persistent: body.rememberMe ?? true,
        userAgent: userAgentOf(request),
      }),
    );
  }
}
