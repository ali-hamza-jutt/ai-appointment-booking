import {
  Body,
  Controller,
  Get,
  Patch,
  Path,
  Query,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import type {
  BusinessReviewListResponse,
  BusinessReviewResponse,
  ModerateReviewRequest,
  ReviewStatus,
} from "../dto/review.dto.js";
import { reviewService } from "../review.service.js";

@Route("businesses/{businessId}/reviews")
@Tags("Reviews")
export class BusinessReviewController extends Controller {
  /** Reviews newest first, with the average rating and how many wait to be published. */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Reviews retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listBusinessReviews(
    @Path() businessId: string,
    @Query() status?: ReviewStatus,
  ): Promise<BusinessReviewListResponse> {
    return reviewService.listForBusiness(businessId, status);
  }

  /** Publishes or hides a review, and sets or removes the public answer to it. */
  @Patch("{reviewId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Review updated")
  @Response<ApiErrorResponse>(404, "Review was not found")
  @Response<ApiErrorResponse>(422, "Status or reply is invalid")
  public moderateReview(
    @Path() businessId: string,
    @Path() reviewId: string,
    @Body() body: ModerateReviewRequest,
  ): Promise<BusinessReviewResponse> {
    return reviewService.moderate(businessId, reviewId, body);
  }
}
