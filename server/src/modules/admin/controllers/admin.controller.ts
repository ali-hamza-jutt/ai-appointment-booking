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
import { adminService } from "../admin.service.js";
import type {
  AdminAuditLogResponse,
  AdminBusinessDetail,
  AdminBusinessListResponse,
  AdminUserListResponse,
  FailedWorkResponse,
  ImpersonationResponse,
  SuspendBusinessRequest,
} from "../dto/admin.dto.js";

/** Platform admins only. */
@Route("admin")
@Tags("Platform admin")
@Security("jwt", ["platform:admin"])
@Response<ApiErrorResponse>(403, "Only platform admins can do this")
export class AdminController extends Controller {
  /** Every business, newest first, with its owner, size, recent bookings and model spend. */
  @Get("businesses")
  public listAdminBusinesses(@Query() search?: string): Promise<AdminBusinessListResponse> {
    return adminService.listBusinesses(search);
  }

  /** One business with its team and 30 days of model spend. */
  @Get("businesses/{businessId}")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public getAdminBusiness(@Path() businessId: string): Promise<AdminBusinessDetail> {
    return adminService.getBusiness(businessId);
  }

  /** Stops the business taking bookings and chats; its team can still read. */
  @Post("businesses/{businessId}/suspend")
  @Response<ApiErrorResponse>(404, "Business was not found")
  @Response<ApiErrorResponse>(422, "A reason is needed")
  public suspendBusiness(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Body() body: SuspendBusinessRequest,
  ): Promise<AdminBusinessDetail> {
    return adminService.suspend(getAuthenticatedUser(request).id, businessId, body.reason);
  }

  @Post("businesses/{businessId}/unsuspend")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public unsuspendBusiness(@Request() request: ExpressRequest, @Path() businessId: string): Promise<AdminBusinessDetail> {
    return adminService.unsuspend(getAuthenticatedUser(request).id, businessId);
  }

  /** People, newest first, searchable by email or name. */
  @Get("users")
  public listAdminUsers(@Query() search?: string): Promise<AdminUserListResponse> {
    return adminService.listUsers(search);
  }

  /** A 15-minute session as this user, to support them. Recorded in the audit log, with every change made. */
  @Post("users/{userId}/impersonate")
  @Response<ApiErrorResponse>(403, "Platform admins can't be impersonated")
  @Response<ApiErrorResponse>(404, "User was not found")
  public impersonateUser(@Request() request: ExpressRequest, @Path() userId: string): Promise<ImpersonationResponse> {
    return adminService.impersonate(getAuthenticatedUser(request).id, userId);
  }

  /** Jobs that ran out of retries, and outbox events the relay gave up on. */
  @Get("jobs/failed")
  public listFailedWork(): Promise<FailedWorkResponse> {
    return adminService.listFailedWork();
  }

  @Post("jobs/{queue}/{jobId}/retry")
  @SuccessResponse("204", "Job queued again")
  @Response<ApiErrorResponse>(404, "Job is not in the failed list")
  @Response<ApiErrorResponse>(503, "Queues are not configured")
  public async retryFailedJob(
    @Request() request: ExpressRequest,
    @Path() queue: string,
    @Path() jobId: string,
  ): Promise<void> {
    await adminService.retryJob(getAuthenticatedUser(request).id, queue, jobId);
    this.setStatus(204);
  }

  @Post("outbox/{eventId}/replay")
  @SuccessResponse("204", "Event queued again")
  @Response<ApiErrorResponse>(404, "Event was not found or was delivered")
  public async replayOutboxEvent(@Request() request: ExpressRequest, @Path() eventId: string): Promise<void> {
    await adminService.replayOutboxEvent(getAuthenticatedUser(request).id, eventId);
    this.setStatus(204);
  }

  /** What admins did, newest first. */
  @Get("audit-log")
  public listAdminAuditLog(): Promise<AdminAuditLogResponse> {
    return adminService.listAuditLog();
  }
}
