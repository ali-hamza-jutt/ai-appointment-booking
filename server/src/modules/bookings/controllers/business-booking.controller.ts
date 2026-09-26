import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Get,
  Patch,
  Path,
  Post,
  Query,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import { getAuthenticatedUser } from "../../../utils/request.js";
import { bookingService } from "../booking.service.js";
import type {
  BookingEventListResponse,
  BookingListResponse,
  BookingResponse,
  BookingStatus,
  CancelAppointmentRequest,
  CreateStaffBookingRequest,
  StaffRescheduleRequest,
} from "../dto/booking.dto.js";

@Route("businesses/{businessId}/bookings")
@Tags("Bookings")
export class BusinessBookingController extends Controller {
  /**
   * Lists bookings by start time, optionally within a date range.
   * @param from Earliest start (inclusive).
   * @param to Latest start (exclusive), at most 92 days after `from`.
   * @isInt limit Limit must be a whole number
   * @minimum limit 1
   * @maximum limit 100
   */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Bookings retrieved")
  @Response<ApiErrorResponse>(422, "Query is invalid")
  public listBookings(
    @Path() businessId: string,
    @Query() status?: BookingStatus,
    @Query() staffId?: string,
    @Query() from?: Date,
    @Query() to?: Date,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<BookingListResponse> {
    return bookingService.listForBusiness(businessId, {
      ...(status ? { status } : {}),
      ...(staffId ? { staffId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(cursor ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  /** Books a customer in directly; the booking is confirmed immediately. */
  @Post()
  @Security("jwt", ["business:operate"])
  @SuccessResponse("201", "Booking created")
  @Response<ApiErrorResponse>(404, "Customer or service was not found")
  @Response<ApiErrorResponse>(409, "The selected time is unavailable")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createBooking(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Body() body: CreateStaffBookingRequest,
  ): Promise<BookingResponse> {
    this.setStatus(201);
    return bookingService.createForStaff(businessId, getAuthenticatedUser(request).id, body);
  }

  /** Returns one booking. */
  @Get("{bookingId}")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Booking retrieved")
  @Response<ApiErrorResponse>(404, "Booking was not found")
  public getBooking(
    @Path() businessId: string,
    @Path() bookingId: string,
  ): Promise<BookingResponse> {
    return bookingService.getForBusiness(businessId, bookingId);
  }

  /** The booking's audit trail of state changes. */
  @Get("{bookingId}/events")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Events retrieved")
  @Response<ApiErrorResponse>(404, "Booking was not found")
  public listBookingEvents(
    @Path() businessId: string,
    @Path() bookingId: string,
  ): Promise<BookingEventListResponse> {
    return bookingService.listEvents(businessId, bookingId);
  }

  /** Approves a booking waiting for approval. */
  @Post("{bookingId}/approve")
  @Security("jwt", ["business:operate"])
  @SuccessResponse("200", "Booking approved")
  @Response<ApiErrorResponse>(409, "Booking cannot change to that status")
  public approveBooking(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Path() bookingId: string,
  ): Promise<BookingResponse> {
    return bookingService.applyStaffAction(
      businessId,
      bookingId,
      getAuthenticatedUser(request).id,
      "APPROVE",
    );
  }

  /** Declines a booking waiting for approval. */
  @Post("{bookingId}/decline")
  @Security("jwt", ["business:operate"])
  @SuccessResponse("200", "Booking declined")
  @Response<ApiErrorResponse>(409, "Booking cannot change to that status")
  public declineBooking(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Path() bookingId: string,
  ): Promise<BookingResponse> {
    return bookingService.applyStaffAction(
      businessId,
      bookingId,
      getAuthenticatedUser(request).id,
      "DECLINE",
    );
  }

  /** Marks the customer as arrived. */
  @Post("{bookingId}/check-in")
  @Security("jwt", ["business:operate"])
  @SuccessResponse("200", "Customer checked in")
  @Response<ApiErrorResponse>(409, "Booking cannot change to that status")
  public checkInBooking(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Path() bookingId: string,
  ): Promise<BookingResponse> {
    return bookingService.applyStaffAction(
      businessId,
      bookingId,
      getAuthenticatedUser(request).id,
      "CHECK_IN",
    );
  }

  /** Marks a checked-in visit as finished. */
  @Post("{bookingId}/complete")
  @Security("jwt", ["business:operate"])
  @SuccessResponse("200", "Booking completed")
  @Response<ApiErrorResponse>(409, "Booking cannot change to that status")
  public completeBooking(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Path() bookingId: string,
  ): Promise<BookingResponse> {
    return bookingService.applyStaffAction(
      businessId,
      bookingId,
      getAuthenticatedUser(request).id,
      "COMPLETE",
    );
  }

  /** Marks a confirmed booking as a no-show once the grace period has passed. */
  @Post("{bookingId}/no-show")
  @Security("jwt", ["business:operate"])
  @SuccessResponse("200", "Marked as no-show")
  @Response<ApiErrorResponse>(409, "Too early, or the booking cannot change to that status")
  public markBookingNoShow(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Path() bookingId: string,
  ): Promise<BookingResponse> {
    return bookingService.applyStaffAction(
      businessId,
      bookingId,
      getAuthenticatedUser(request).id,
      "MARK_NO_SHOW",
    );
  }

  /** Cancels a booking on behalf of the business. */
  @Post("{bookingId}/cancel")
  @Security("jwt", ["business:operate"])
  @SuccessResponse("200", "Booking cancelled")
  @Response<ApiErrorResponse>(409, "Booking cannot change to that status")
  public cancelBooking(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Path() bookingId: string,
    @Body() body?: CancelAppointmentRequest,
  ): Promise<BookingResponse> {
    return bookingService.cancelForStaff(
      businessId,
      bookingId,
      getAuthenticatedUser(request).id,
      body?.reason,
    );
  }

  /** Moves a booking to a new time, and optionally to another staff member. */
  @Patch("{bookingId}/reschedule")
  @Security("jwt", ["business:operate"])
  @SuccessResponse("200", "Booking rescheduled")
  @Response<ApiErrorResponse>(409, "The new time is unavailable")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public rescheduleBooking(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Path() bookingId: string,
    @Body() body: StaffRescheduleRequest,
  ): Promise<BookingResponse> {
    return bookingService.rescheduleForStaff(
      businessId,
      bookingId,
      getAuthenticatedUser(request).id,
      body,
    );
  }
}
