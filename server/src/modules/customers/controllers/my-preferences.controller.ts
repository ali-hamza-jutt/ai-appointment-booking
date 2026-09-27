import type { Request as ExpressRequest } from "express";
import {
  Controller,
  Delete,
  Get,
  Path,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { getAuthenticatedUser } from "../../../utils/request.js";
import { customerProfileService } from "../customer-profile.service.js";
import type { MyPreferencesResponse } from "../dto/customer-profile.dto.js";

@Route("me/preferences")
@Tags("Customers")
@Security("jwt")
export class MyPreferencesController extends Controller {
  /** What each business's booking assistant remembers about the signed-in user. */
  @Get()
  @SuccessResponse("200", "Preferences retrieved")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  public listMyPreferences(@Request() request: ExpressRequest): Promise<MyPreferencesResponse> {
    return customerProfileService.listMyPreferences(getAuthenticatedUser(request).id);
  }

  /** Forgets one remembered preference. */
  @Delete("{preferenceId}")
  @SuccessResponse("204", "Preference removed")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(404, "Preference was not found")
  public async deleteMyPreference(
    @Request() request: ExpressRequest,
    @Path() preferenceId: string,
  ): Promise<void> {
    await customerProfileService.deleteMyPreference(getAuthenticatedUser(request).id, preferenceId);
    this.setStatus(204);
  }
}
