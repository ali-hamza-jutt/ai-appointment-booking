import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Delete,
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
import type {
  JoinWaitlistRequest,
  WaitlistEntryResponse,
  WaitlistListResponse,
} from "../dto/waitlist.dto.js";
import { waitlistService } from "../waitlist.service.js";

@Route("me/waitlist")
@Tags("Waitlist")
@Security("jwt")
export class MyWaitlistController extends Controller {
  /** The signed-in customer's waits at every business, newest first. */
  @Get()
  @SuccessResponse("200", "Waitlist retrieved")
  public listMyWaitlist(@Request() request: ExpressRequest): Promise<WaitlistListResponse> {
    return waitlistService.listMine(getAuthenticatedUser(request).id);
  }

  /**
   * Waits for a service between two dates. If a time opens up, it is held
   * for the customer for 15 minutes and they are emailed or texted a link to
   * confirm it. Joining the same wait twice returns the first entry.
   */
  @Post()
  @SuccessResponse("201", "Joined the waitlist")
  @Response<ApiErrorResponse>(404, "Business, service or provider was not found")
  @Response<ApiErrorResponse>(409, "Too many waits at this business")
  @Response<ApiErrorResponse>(422, "Dates, part of day or time zone are invalid")
  public async joinWaitlist(
    @Request() request: ExpressRequest,
    @Body() body: JoinWaitlistRequest,
  ): Promise<WaitlistEntryResponse> {
    this.setStatus(201);
    return waitlistService.join(getAuthenticatedUser(request).id, body);
  }

  /** Leaves the waitlist; a time held for the customer passes to the next person. */
  @Delete("{entryId}")
  @SuccessResponse("204", "Left the waitlist")
  @Response<ApiErrorResponse>(404, "Waitlist entry was not found")
  public async leaveWaitlist(@Request() request: ExpressRequest, @Path() entryId: string): Promise<void> {
    await waitlistService.leave(getAuthenticatedUser(request).id, entryId);
    this.setStatus(204);
  }
}
