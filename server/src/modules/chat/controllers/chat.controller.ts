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
import { chatOrchestrationService } from "../chat-orchestration.service.js";
import { chatService } from "../chat.service.js";
import type {
  ChatMessageListResponse,
  ChatSessionListResponse,
  ChatSessionResponse,
  ChatSessionStatus,
  ChatTurnResponse,
  ConfirmChatBookingResponse,
  CreateChatSessionRequest,
  ProcessChatMessageRequest,
} from "../dto/chat.dto.js";

@Route("chat")
@Tags("Chat")
@Security("jwt")
export class ChatController extends Controller {
  /** Creates a chat session for the authenticated user. */
  @Post("sessions")
  @SuccessResponse("201", "Chat session created")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  public async createSession(
    @Request() request: ExpressRequest,
    @Body() body: CreateChatSessionRequest,
  ): Promise<ChatSessionResponse> {
    this.setStatus(201);
    return chatService.createSession(getAuthenticatedUser(request).id, body);
  }

  /**
   * Lists the user's most recently active chat sessions.
   * @isInt limit Limit must be a whole number
   * @minimum limit 1
   * @maximum limit 50
   */
  @Get("sessions")
  @SuccessResponse("200", "Chat sessions retrieved")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(422, "Pagination parameters are invalid")
  public listSessions(
    @Request() request: ExpressRequest,
    @Query() status?: ChatSessionStatus,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<ChatSessionListResponse> {
    return chatService.listSessions(getAuthenticatedUser(request).id, {
      ...(status ? { status } : {}),
      ...(cursor ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  /** Returns one chat session owned by the authenticated user. */
  @Get("sessions/{sessionId}")
  @SuccessResponse("200", "Chat session retrieved")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(404, "Chat session was not found")
  @Response<ApiErrorResponse>(422, "Chat session ID is invalid")
  public getSession(
    @Request() request: ExpressRequest,
    @Path() sessionId: string,
  ): Promise<ChatSessionResponse> {
    return chatService.getSession(getAuthenticatedUser(request).id, sessionId);
  }

  /** Saves a user message, extracts booking details, and returns the persisted assistant reply. */
  @Post("sessions/{sessionId}/messages")
  @SuccessResponse("201", "Chat turn processed")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(404, "Chat session was not found")
  @Response<ApiErrorResponse>(409, "Chat session is closed or the client message ID conflicts")
  @Response<ApiErrorResponse>(422, "Request validation failed")
  @Response<ApiErrorResponse>(429, "Too many requests")
  @Response<ApiErrorResponse>(502, "The AI provider response was invalid")
  @Response<ApiErrorResponse>(503, "The AI integration is unavailable")
  @Response<ApiErrorResponse>(504, "The AI provider request timed out")
  public async createMessage(
    @Request() request: ExpressRequest,
    @Path() sessionId: string,
    @Body() body: ProcessChatMessageRequest,
  ): Promise<ChatTurnResponse> {
    this.setStatus(201);
    return chatOrchestrationService.processMessage(
      getAuthenticatedUser(request).id,
      sessionId,
      body,
    );
  }

  /** Confirms the collected booking details and atomically creates the appointment. */
  @Post("sessions/{sessionId}/confirm")
  @SuccessResponse("201", "Chat appointment created")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(404, "Chat session was not found")
  @Response<ApiErrorResponse>(409, "Booking details are incomplete, the session is closed, or the slot is unavailable")
  @Response<ApiErrorResponse>(422, "Stored booking details are invalid")
  @Response<ApiErrorResponse>(429, "Too many requests")
  public async confirmBooking(
    @Request() request: ExpressRequest,
    @Path() sessionId: string,
  ): Promise<ConfirmChatBookingResponse> {
    this.setStatus(201);
    return chatOrchestrationService.confirmBooking(
      getAuthenticatedUser(request).id,
      sessionId,
    );
  }

  /**
   * Returns messages after the optional cursor for history loading or polling.
   * @isInt limit Limit must be a whole number
   * @minimum limit 1
   * @maximum limit 100
   */
  @Get("sessions/{sessionId}/messages")
  @SuccessResponse("200", "Chat messages retrieved")
  @Response<ApiErrorResponse>(401, "Access token is missing or invalid")
  @Response<ApiErrorResponse>(404, "Chat session was not found")
  @Response<ApiErrorResponse>(422, "Pagination parameters are invalid")
  public listMessages(
    @Request() request: ExpressRequest,
    @Path() sessionId: string,
    @Query() cursor?: string,
    @Query() limit?: number,
  ): Promise<ChatMessageListResponse> {
    return chatService.listMessages(
      getAuthenticatedUser(request).id,
      sessionId,
      {
        ...(cursor ? { cursor } : {}),
        ...(limit !== undefined ? { limit } : {}),
      },
    );
  }
}
