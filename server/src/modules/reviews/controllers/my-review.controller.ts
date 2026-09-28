import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Get,
  Path,
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
import type { MyReviewResponse, ReviewResponse, SubmitReviewRequest } from "../dto/review.dto.js";
import { reviewService } from "../review.service.js";

@Route("appointments/{appointmentId}/review")
@Tags("Reviews")
@Security("jwt")
export class MyReviewController extends Controller {
  /** The customer's review of this visit, and whether they can still write one. */
  @Get()
  @SuccessResponse("200", "Review retrieved")
  @Response<ApiErrorResponse>(404, "Appointment was not found")
  public getMyReview(@Request() request: ExpressRequest, @Path() appointmentId: string): Promise<MyReviewResponse> {
    return reviewService.getMine(getAuthenticatedUser(request).id, appointmentId);
  }

  /**
   * Rates a finished visit from 1 to 5 stars, once, within 30 days. The
   * business publishes reviews before they appear on its booking page.
   */
  @Post()
  @SuccessResponse("201", "Review saved")
  @Response<ApiErrorResponse>(404, "Appointment was not found")
  @Response<ApiErrorResponse>(409, "The visit can't be reviewed, or already was")
  @Response<ApiErrorResponse>(422, "Rating or comment is invalid")
  public async submitReview(
    @Request() request: ExpressRequest,
    @Path() appointmentId: string,
    @Body() body: SubmitReviewRequest,
  ): Promise<ReviewResponse> {
    this.setStatus(201);
    return reviewService.submit(getAuthenticatedUser(request).id, appointmentId, body);
  }
}
