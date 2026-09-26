import {
  Controller,
  Get,
  Path,
  Query,
  Response,
  Route,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { businessService } from "../../businesses/business.service.js";
import type { PublicBusinessResponse } from "../../businesses/dto/business.dto.js";
import { catalogService } from "../catalog.service.js";
import type { PublicServiceListResponse } from "../dto/catalog.dto.js";

@Route("public/{slug}")
@Tags("Public booking")
export class PublicCatalogController extends Controller {
  /** Returns the public profile behind a booking link. */
  @Get()
  @SuccessResponse("200", "Business retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public async getPublicBusiness(@Path() slug: string): Promise<PublicBusinessResponse> {
    return businessService.toPublicResponse(await businessService.getPublicBusiness(slug));
  }

  /**
   * Lists services customers can book online. With `search`, returns the
   * closest fuzzy name matches first.
   */
  @Get("services")
  @SuccessResponse("200", "Services retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listPublicServices(
    @Path() slug: string,
    @Query() search?: string,
  ): Promise<PublicServiceListResponse> {
    return catalogService.listPublicServices(slug, search);
  }
}
