import type { Request as ExpressRequest } from "express";
import {
  Controller,
  Get,
  Hidden,
  Query,
  Request,
  Response,
  Route,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import { env } from "../../../config/env.js";
import { logger } from "../../../config/logger.js";
import type { ApiErrorResponse } from "../../../models/api-error.js";
import {
  setOAuthStateCookie,
  setRefreshCookie,
  takeOAuthStateCookie,
  userAgentOf,
} from "../auth-cookies.js";
import { googleAuthService } from "../google-auth.service.js";

const WEB_CALLBACK_PATH = "/auth/callback";
const WEB_LOGIN_PATH = "/login";

@Route("auth/google")
@Tags("Authentication")
export class GoogleAuthController extends Controller {
  /** Redirects the browser to Google's consent screen. */
  @Get("start")
  @SuccessResponse("302", "Redirect to Google")
  @Response<ApiErrorResponse>(404, "Google sign-in is not configured")
  public startGoogleSignIn(@Request() request: ExpressRequest): void {
    const authorization = googleAuthService.createAuthorization();

    setOAuthStateCookie(request, authorization.state);
    this.redirect(authorization.url);
  }

  /** Google redirects here; signs in and returns the browser to the web app. */
  @Get("callback")
  @Hidden()
  public async googleCallback(
    @Request() request: ExpressRequest,
    @Query() code?: string,
    @Query() state?: string,
    @Query() error?: string,
  ): Promise<void> {
    const stored = takeOAuthStateCookie(request);

    try {
      if (error) throw new Error(`Google returned ${error}`);

      const session = await googleAuthService.completeSignIn(
        { code, state },
        stored,
        userAgentOf(request),
      );

      setRefreshCookie(request, session.refreshToken);
      this.redirect(new URL(WEB_CALLBACK_PATH, env.WEB_ORIGIN).toString());
    } catch (failure) {
      logger.warn({ err: failure }, "Google sign-in failed");

      const loginUrl = new URL(WEB_LOGIN_PATH, env.WEB_ORIGIN);

      loginUrl.searchParams.set("error", "google");
      this.redirect(loginUrl.toString());
    }
  }

  private redirect(url: string): void {
    this.setStatus(302);
    this.setHeader("Location", url);
  }
}
