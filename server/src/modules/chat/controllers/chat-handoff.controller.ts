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
import { chatHandoffService } from "../chat-handoff.service.js";
import type {
  ChatHandoffListResponse,
  ChatHandoffMessage,
  ChatHandoffThreadResponse,
  ReplyToHandoffRequest,
} from "../dto/chat-handoff.dto.js";

@Route("businesses/{businessId}/chat-handoffs")
@Tags("Chat handoffs")
export class ChatHandoffController extends Controller {
  /** Chats the assistant handed to staff that nobody has resolved yet, oldest first. */
  @Get()
  @Security("jwt", ["business:operate"])
  @Response<ApiErrorResponse>(404, "Business was not found")
  public listHandoffs(@Path() businessId: string): Promise<ChatHandoffListResponse> {
    return chatHandoffService.listOpen(businessId);
  }

  /** A handed-off chat with its latest 100 messages, oldest first. */
  @Get("{sessionId}")
  @Security("jwt", ["business:operate"])
  @Response<ApiErrorResponse>(404, "Handoff was not found")
  public getHandoffThread(
    @Path() businessId: string,
    @Path() sessionId: string,
  ): Promise<ChatHandoffThreadResponse> {
    return chatHandoffService.getThread(businessId, sessionId);
  }

  /**
   * Replies in the customer's chat as the business, under the staff member's
   * first name. Only while the handoff is open.
   */
  @Post("{sessionId}/messages")
  @Security("jwt", ["business:operate"])
  @SuccessResponse("201", "Reply sent")
  @Response<ApiErrorResponse>(404, "Handoff was not found")
  @Response<ApiErrorResponse>(409, "The handoff is resolved")
  @Response<ApiErrorResponse>(422, "Message is empty or too long")
  public async replyToHandoff(
    @Request() request: ExpressRequest,
    @Path() businessId: string,
    @Path() sessionId: string,
    @Body() body: ReplyToHandoffRequest,
  ): Promise<ChatHandoffMessage> {
    this.setStatus(201);
    return chatHandoffService.reply(businessId, sessionId, getAuthenticatedUser(request).id, body.content);
  }

  /** Marks a handoff as dealt with. */
  @Post("{sessionId}/resolve")
  @Security("jwt", ["business:operate"])
  @SuccessResponse("204", "Resolved")
  @Response<ApiErrorResponse>(404, "Handoff was not found")
  public async resolveHandoff(@Path() businessId: string, @Path() sessionId: string): Promise<void> {
    await chatHandoffService.resolve(businessId, sessionId);
    this.setStatus(204);
  }
}
