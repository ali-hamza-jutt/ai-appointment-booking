import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Get,
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
import { appointmentService } from "../appointment.service.js";
import type {
  AppointmentListResponse,
  AppointmentResponse,
  AppointmentStatus,
  CreateAppointmentRequest,
} from "../dto/appointment.dto.js";

@Route("appointments")
@Tags("Appointments")
@Security("jwt")
export class AppointmentController extends Controller {
  /** Creates an appointment for the authenticated user. */
  @Post()
  @SuccessResponse("201", "Appointment created")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(409, "The selected time is unavailable")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createAppointment(
    @Request() request: ExpressRequest,
    @Body() body: CreateAppointmentRequest,
  ): Promise<AppointmentResponse> {
    this.setStatus(201);
    return appointmentService.createAppointment(
      getAuthenticatedUser(request).id,
      body,
    );
  }

  /**
   * Lists the user's most recently created appointments using cursor pagination.
   * @isInt limit Limit must be a whole number
   * @minimum limit 1
   * @maximum limit 50
   */
  @Get()
  @SuccessResponse("200", "Appointments retrieved")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(422, "Pagination parameters are invalid")
  public listAppointments(
    @Request() request: ExpressRequest,
    @Query() status?: AppointmentStatus,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<AppointmentListResponse> {
    return appointmentService.listAppointments(
      getAuthenticatedUser(request).id,
      {
        ...(status ? { status } : {}),
        ...(cursor ? { cursor } : {}),
        ...(limit !== undefined ? { limit } : {}),
      },
    );
  }

  /** Returns one appointment owned by the authenticated user. */
  @Get("{appointmentId}")
  @SuccessResponse("200", "Appointment retrieved")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(404, "Appointment was not found")
  @Response<ApiErrorResponse>(422, "Appointment ID is invalid")
  public getAppointment(
    @Request() request: ExpressRequest,
    @Path() appointmentId: string,
  ): Promise<AppointmentResponse> {
    return appointmentService.getAppointment(
      getAuthenticatedUser(request).id,
      appointmentId,
    );
  }
}
