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
import type { BillingRedirectResponse, BillingResponse, StartCheckoutRequest } from "../dto/subscription.dto.js";
import { subscriptionService } from "../subscription.service.js";

@Route("businesses/{businessId}/billing")
@Tags("Billing")
export class BillingController extends Controller {
  /** The business's BookWise plan, what it includes, this month's usage, and the plans on offer. */
  @Get()
  @Security("jwt", ["business:manage"])
  @SuccessResponse("200", "Billing retrieved")
  public getBilling(@Path() businessId: string): Promise<BillingResponse> {
    return subscriptionService.getBilling(businessId);
  }

  /** Starts a subscription: returns Stripe Checkout's page for the owner to pay on. */
  @Post("checkout")
  @Security("jwt", ["business:owner"])
  @SuccessResponse("200", "Checkout started")
  @Response<ApiErrorResponse>(409, "Already subscribed; change the plan in the billing portal")
  @Response<ApiErrorResponse>(503, "Billing is not set up")
  public startCheckout(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Body() body: StartCheckoutRequest,
  ): Promise<BillingRedirectResponse> {
    return subscriptionService.startCheckout(businessId, body.plan, getAuthenticatedUser(request).email);
  }

  /** Stripe's billing portal, to change plan or card, see invoices or cancel. */
  @Post("portal")
  @Security("jwt", ["business:owner"])
  @SuccessResponse("200", "Portal opened")
  @Response<ApiErrorResponse>(409, "No subscription yet")
  @Response<ApiErrorResponse>(503, "Billing is not set up")
  public openBillingPortal(@Path() businessId: string): Promise<BillingRedirectResponse> {
    return subscriptionService.openPortal(businessId);
  }
}
