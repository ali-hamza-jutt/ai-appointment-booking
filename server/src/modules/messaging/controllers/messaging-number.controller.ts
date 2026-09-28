import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "@tsoa/runtime";

import type { ApiErrorResponse } from "../../../models/api-error.js";
import type {
  AddMessagingNumberRequest,
  MessagingNumberListResponse,
  MessagingNumberResponse,
} from "../dto/messaging.dto.js";
import { messagingService } from "../messaging.service.js";

@Route("businesses/{businessId}/messaging-numbers")
@Tags("Businesses")
export class MessagingNumberController extends Controller {
  /** Numbers customers can text or WhatsApp to book, and the webhook to set on them in Twilio. */
  @Get()
  @Security("jwt", ["business:read"])
  @SuccessResponse("200", "Numbers retrieved")
  public listMessagingNumbers(@Path() businessId: string): Promise<MessagingNumberListResponse> {
    return messagingService.listNumbers(businessId);
  }

  /** Connects a Twilio SMS number or WhatsApp sender to the business. */
  @Post()
  @Security("jwt", ["business:manage"])
  @SuccessResponse("201", "Number connected")
  @Response<ApiErrorResponse>(409, "The number belongs to another business")
  @Response<ApiErrorResponse>(422, "Not a phone number")
  public async addMessagingNumber(
    @Path() businessId: string,
    @Body() body: AddMessagingNumberRequest,
  ): Promise<MessagingNumberResponse> {
    this.setStatus(201);
    return messagingService.addNumber(businessId, body.channel, body.number);
  }

  @Delete("{numberId}")
  @Security("jwt", ["business:manage"])
  @SuccessResponse("204", "Number disconnected")
  @Response<ApiErrorResponse>(404, "Number was not connected")
  public async removeMessagingNumber(@Path() businessId: string, @Path() numberId: string): Promise<void> {
    await messagingService.removeNumber(businessId, numberId);
    this.setStatus(204);
  }
}
