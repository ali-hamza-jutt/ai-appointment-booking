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
  AppointmentListResponse,
  AppointmentResponse,
  AppointmentStatus,
  CancelAppointmentRequest,
  CreateHoldRequest,
  RescheduleAppointmentRequest,
} from "../dto/booking.dto.js";

@Route("appointments")
@Tags("Appointments")
@Security("jwt")
export class CustomerBookingController extends Controller {
  /**
   * Holds a slot for a few minutes while the customer confirms, so nobody
   * else can take it in the meantime.
   */
  @Post("holds")
  @SuccessResponse("201", "Slot held")
  @Response<ApiErrorResponse>(404, "Business or service was not found")
  @Response<ApiErrorResponse>(409, "The selected time is unavailable")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createHold(
    @Request() request: ExpressRequest,
    @Body() body: CreateHoldRequest,
  ): Promise<AppointmentResponse> {
    this.setStatus(201);
    return bookingService.createHold(getAuthenticatedUser(request).id, body);
  }

  /** Confirms a held slot. Returns PENDING when the business approves bookings manually. */
  @Post("{appointmentId}/confirm")
  @SuccessResponse("200", "Appointment confirmed")
  @Response<ApiErrorResponse>(404, "Appointment was not found")
  @Response<ApiErrorResponse>(409, "The hold expired and the slot was taken")
  public confirmAppointment(
    @Request() request: ExpressRequest,
    @Path() appointmentId: string,
  ): Promise<AppointmentResponse> {
    return bookingService.confirmForCustomer(getAuthenticatedUser(request).id, appointmentId);
  }

  /** Cancels an appointment within the business's cancellation window. */
  @Patch("{appointmentId}/cancel")
  @SuccessResponse("200", "Appointment cancelled")
  @Response<ApiErrorResponse>(404, "Appointment was not found")
  @Response<ApiErrorResponse>(409, "Appointment can no longer be cancelled")
  @Response<ApiErrorResponse>(422, "Appointment ID is invalid")
  public cancelAppointment(
    @Request() request: ExpressRequest,
    @Path() appointmentId: string,
    @Body() body?: CancelAppointmentRequest,
  ): Promise<AppointmentResponse> {
    return bookingService.cancelForCustomer(
      getAuthenticatedUser(request).id,
      appointmentId,
      body?.reason,
    );
  }

  /** Moves an appointment to a new open slot, in its original time zone. */
  @Patch("{appointmentId}/reschedule")
  @SuccessResponse("200", "Appointment rescheduled")
  @Response<ApiErrorResponse>(404, "Appointment was not found")
  @Response<ApiErrorResponse>(409, "Not reschedulable or the new time is unavailable")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public rescheduleAppointment(
    @Request() request: ExpressRequest,
    @Path() appointmentId: string,
    @Body() body: RescheduleAppointmentRequest,
  ): Promise<AppointmentResponse> {
    return bookingService.rescheduleForCustomer(
      getAuthenticatedUser(request).id,
      appointmentId,
      body,
    );
  }

  /**
   * Lists the customer's appointments at every business, newest first.
   * @isInt limit Limit must be a whole number
   * @minimum limit 1
   * @maximum limit 50
   */
  @Get()
  @SuccessResponse("200", "Appointments retrieved")
  @Response<ApiErrorResponse>(422, "Pagination parameters are invalid")
  public listAppointments(
    @Request() request: ExpressRequest,
    @Query() status?: AppointmentStatus,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<AppointmentListResponse> {
    return bookingService.listForCustomer(getAuthenticatedUser(request).id, {
      ...(status ? { status } : {}),
      ...(cursor ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  /** Returns one of the customer's appointments. */
  @Get("{appointmentId}")
  @SuccessResponse("200", "Appointment retrieved")
  @Response<ApiErrorResponse>(404, "Appointment was not found")
  @Response<ApiErrorResponse>(422, "Appointment ID is invalid")
  public getAppointment(
    @Request() request: ExpressRequest,
    @Path() appointmentId: string,
  ): Promise<AppointmentResponse> {
    return bookingService.getForCustomer(getAuthenticatedUser(request).id, appointmentId);
  }
}
