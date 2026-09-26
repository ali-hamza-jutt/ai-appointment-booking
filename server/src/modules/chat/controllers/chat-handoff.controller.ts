import {
  Controller,
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
import { chatHandoffService } from "../chat-handoff.service.js";
import type { ChatHandoffListResponse } from "../dto/chat-handoff.dto.js";

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
