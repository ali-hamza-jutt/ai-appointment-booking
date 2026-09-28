import { Controller, Get, Path, Response, Route, SuccessResponse, Tags } from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import type { PublicReviewListResponse } from "../dto/review.dto.js";
import { reviewService } from "../review.service.js";

@Route("public/{slug}/reviews")
@Tags("Public booking")
export class PublicReviewController extends Controller {
  /** Published reviews, newest first, with their average rating. */
  @Get()
  @SuccessResponse("200", "Reviews retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listPublicReviews(@Path() slug: string): Promise<PublicReviewListResponse> {
    return reviewService.listPublic(slug);
  }
}
