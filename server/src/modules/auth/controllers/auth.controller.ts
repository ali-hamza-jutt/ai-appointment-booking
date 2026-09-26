import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Get,
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
import {
  assertTrustedOrigin,
  clearRefreshCookie,
  readRefreshCookie,
  respondWithSession,
  userAgentOf,
} from "../auth-cookies.js";
import { authService } from "../auth.service.js";
import type {
  AuthProvidersResponse,
  AuthResponse,
  AuthUserResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  SignInRequest,
  SignUpRequest,
  VerifyEmailRequest,
} from "../dto/auth.dto.js";
import { googleAuthService } from "../google-auth.service.js";
import { phoneAuthService } from "../phone-auth.service.js";
import { sessionService } from "../session.service.js";

@Route("auth")
@Tags("Authentication")
export class AuthController extends Controller {
  /** Creates an account, emails a verification link and starts a session. */
  @Post("signup")
  @SuccessResponse("201", "Account created")
  @Response<ApiErrorResponse>(409, "Email is already registered")
  @Response<ApiErrorResponse>(429, "Too many requests")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async signUp(
    @Body() body: SignUpRequest,
    @Request() request: ExpressRequest,
  ): Promise<AuthResponse> {
    this.setStatus(201);
    return respondWithSession(request, await authService.signUp(body, userAgentOf(request)));
  }

  /** Signs in with email and password; the refresh token is set as an httpOnly cookie. */
  @Post("sign-in")
  @SuccessResponse("200", "Authenticated")
  @Response<ApiErrorResponse>(401, "Invalid credentials")
  @Response<ApiErrorResponse>(429, "Too many requests")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async signIn(
    @Body() body: SignInRequest,
    @Request() request: ExpressRequest,
  ): Promise<AuthResponse> {
    return respondWithSession(request, await authService.signIn(body, userAgentOf(request)));
  }

  /** Swaps the refresh cookie for a new one and returns a fresh access token. */
  @Post("refresh")
  @SuccessResponse("200", "Session refreshed")
  @Response<ApiErrorResponse>(401, "No valid session")
  @Response<ApiErrorResponse>(403, "Request did not come from the web app")
  public async refresh(@Request() request: ExpressRequest): Promise<AuthResponse> {
    assertTrustedOrigin(request);

    try {
      return respondWithSession(
        request,
        await sessionService.refresh(readRefreshCookie(request), userAgentOf(request)),
      );
    } catch (error) {
      clearRefreshCookie(request);
      throw error;
    }
  }

  /** Ends this browser's session. */
  @Post("sign-out")
  @SuccessResponse("204", "Signed out")
  @Response<ApiErrorResponse>(403, "Request did not come from the web app")
  public async signOut(@Request() request: ExpressRequest): Promise<void> {
    assertTrustedOrigin(request);
    await sessionService.revoke(readRefreshCookie(request));
    clearRefreshCookie(request);
    this.setStatus(204);
  }

  /** Returns the current user represented by the JWT subject. */
  @Get("me")
  @Security("jwt")
  @SuccessResponse("200", "Current user")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(404, "User account was not found")
  public getCurrentUser(@Request() request: ExpressRequest): Promise<AuthUserResponse> {
    return authService.getCurrentUser(getAuthenticatedUser(request).id);
  }

  /** Optional sign-in methods available in this deployment. */
  @Get("providers")
  public getProviders(): AuthProvidersResponse {
    return { google: googleAuthService.isConfigured, phone: phoneAuthService.isAvailable };
  }

  /** Sends a new verification link to the signed-in user's email. */
  @Post("email/verification")
  @Security("jwt")
  @SuccessResponse("202", "Link sent if the email is still unverified")
  @Response<ApiErrorResponse>(429, "Too many requests")
  public async resendVerification(@Request() request: ExpressRequest): Promise<void> {
    await authService.resendVerification(getAuthenticatedUser(request).id);
    this.setStatus(202);
  }

  /** Confirms an email address from the emailed link. */
  @Post("email/verify")
  @SuccessResponse("200", "Email verified")
  @Response<ApiErrorResponse>(400, "Link is invalid or expired")
  public verifyEmail(@Body() body: VerifyEmailRequest): Promise<AuthUserResponse> {
    return authService.verifyEmail(body.token);
  }

  /** Emails a reset link if the address is registered; the response is the same either way. */
  @Post("password/forgot")
  @SuccessResponse("202", "Request accepted")
  @Response<ApiErrorResponse>(429, "Too many requests")
  public async forgotPassword(@Body() body: ForgotPasswordRequest): Promise<void> {
    await authService.requestPasswordReset(body.email);
    this.setStatus(202);
  }

  /** Sets a new password from an emailed link and signs out every session. */
  @Post("password/reset")
  @SuccessResponse("204", "Password changed")
  @Response<ApiErrorResponse>(400, "Link is invalid or expired")
  @Response<ApiErrorResponse>(422, "Password is too weak")
  public async resetPassword(@Body() body: ResetPasswordRequest): Promise<void> {
    await authService.resetPassword(body);
    this.setStatus(204);
  }
}
