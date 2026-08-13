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

import type { AuthenticatedUser } from "../../../models/authenticated-user.js";
import type { ApiErrorResponse } from "../../../models/api-error.js";
import { authService } from "../auth.service.js";
import type {
  AuthResponse,
  AuthUserResponse,
  SignInRequest,
  SignUpRequest,
} from "../dto/auth.dto.js";

@Route("auth")
@Tags("Authentication")
export class AuthController extends Controller {
  /** Creates a user account and returns a short-lived JWT access token. */
  @Post("signup")
  @SuccessResponse("201", "Account created")
  @Response<ApiErrorResponse>(409, "Email is already registered")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async signUp(@Body() request: SignUpRequest): Promise<AuthResponse> {
    this.setStatus(201);
    return authService.signUp(request);
  }

  /** Authenticates a user and returns a short-lived JWT access token. */
  @Post("sign-in")
  @SuccessResponse("200", "Authenticated")
  @Response<ApiErrorResponse>(401, "Invalid credentials")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public signIn(@Body() request: SignInRequest): Promise<AuthResponse> {
    return authService.signIn(request);
  }

  /** Returns the current user represented by the JWT subject. */
  @Get("me")
  @Security("jwt")
  @SuccessResponse("200", "Current user")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(404, "User account was not found")
  public getCurrentUser(
    @Request() request: ExpressRequest,
  ): Promise<AuthUserResponse> {
    const authenticatedRequest = request as ExpressRequest & {
      user: AuthenticatedUser;
    };

    return authService.getCurrentUser(authenticatedRequest.user.id);
  }
}
