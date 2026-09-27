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
import type {
  BookingPaymentListResponse,
  BookingPaymentSummary,
  PaymentAccountResponse,
  PaymentLinkResponse,
  RefundBookingRequest,
} from "../dto/payment.dto.js";
import { paymentAccountService } from "../payment-account.service.js";
import { paymentService } from "../payment.service.js";

@Route("businesses/{businessId}")
@Tags("Payments")
export class PaymentAccountController extends Controller {
  /** Whether the business can take deposits online, and how far Stripe onboarding has got. */
  @Get("payments/account")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Payment account retrieved")
  @Response<ApiErrorResponse>(404, "Business was not found")
  public getPaymentAccount(@Path() businessId: string): Promise<PaymentAccountResponse> {
    return paymentAccountService.getAccount(businessId);
  }

  /** Stripe's onboarding page for the business; creates its Stripe account the first time. Owners only. */
  @Post("payments/account/onboarding")
  @Security("jwt", ["business:owner"])
  @SuccessResponse("200", "Onboarding link created")
  @Response<ApiErrorResponse>(502, "Stripe could not be reached")
  @Response<ApiErrorResponse>(503, "Online payments are not configured")
  public startPaymentOnboarding(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
  ): Promise<PaymentLinkResponse> {
    return paymentAccountService.startOnboarding(businessId, getAuthenticatedUser(request).email);
  }

  /** Re-reads the account from Stripe, for example after returning from onboarding. */
  @Post("payments/account/refresh")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Payment account refreshed")
  @Response<ApiErrorResponse>(503, "Online payments are not configured")
  public refreshPaymentAccount(@Path() businessId: string): Promise<PaymentAccountResponse> {
    return paymentAccountService.refreshAccount(businessId);
  }

  /** A one-time link to the business's Stripe dashboard for payouts and disputes. Owners only. */
  @Post("payments/account/dashboard")
  @Security("jwt", ["business:owner"])
  @SuccessResponse("200", "Dashboard link created")
  @Response<ApiErrorResponse>(409, "No Stripe account is connected")
  public openPaymentDashboard(@Path() businessId: string): Promise<PaymentLinkResponse> {
    return paymentAccountService.dashboardLink(businessId);
  }

  /** Payments taken for one booking, newest first. */
  @Get("bookings/{bookingId}/payments")
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Payments retrieved")
  public listBookingPayments(
    @Path() businessId: string,
    @Path() bookingId: string,
  ): Promise<BookingPaymentListResponse> {
    return paymentService.listForBooking(businessId, bookingId);
  }

  /** Refunds all or part of what was paid for a booking. */
  @Post("bookings/{bookingId}/refunds")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Refund issued")
  @Response<ApiErrorResponse>(409, "Nothing on this booking can be refunded")
  @Response<ApiErrorResponse>(422, "Refund amount is invalid")
  public refundBooking(
    @Path() businessId: string,
    @Path() bookingId: string,
    @Body() body: RefundBookingRequest,
  ): Promise<BookingPaymentSummary> {
    return paymentService.refundForStaff(businessId, bookingId, body);
  }
}
