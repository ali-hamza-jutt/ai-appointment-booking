import {
  Body,
  Controller,
  Post,
  Response,
  Route,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { authService } from "../auth.service.js";
import type {
  AuthResponse,
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
}
