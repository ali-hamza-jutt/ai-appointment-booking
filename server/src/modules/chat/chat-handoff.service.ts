import { ERROR_CODES, ERROR_MESSAGES } from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { assertUuid } from "../../utils/identifiers.js";
import { publishChatEvent } from "./chat-events.js";
import { chatHandoffDal } from "./dal/chat-handoff.dal.js";
import type { ChatHandoffListResponse } from "./dto/chat-handoff.dto.js";

const MAX_OPEN_HANDOFFS = 100;

/** Chats the assistant passed to a person, as the business sees them. */
export class ChatHandoffService {
  public async listOpen(businessId: string): Promise<ChatHandoffListResponse> {
    const sessions = await chatHandoffDal.listOpen(businessId, MAX_OPEN_HANDOFFS);

    return {
      items: sessions.map((session) => ({
        sessionId: session.id,
        customer: { name: session.user.fullName, email: session.user.email, phone: session.user.phone },
        reason: session.handoffReason,
        requestedAt: session.handoffRequestedAt as Date,
        resolvedAt: session.handoffResolvedAt,
        recentMessages: [...session.messages].reverse(),
      })),
    };
  }

  public async resolve(businessId: string, sessionId: string): Promise<void> {
    assertUuid("sessionId", sessionId);

    if (!(await chatHandoffDal.resolve(businessId, sessionId, new Date()))) {
      throw new AppError(404, ERROR_CODES.CHAT_SESSION_NOT_FOUND, ERROR_MESSAGES.CHAT_SESSION_NOT_FOUND);
    }

    publishChatEvent({ type: "handoff", sessionId, businessId, state: "resolved" });
  }
}

export const chatHandoffService = new ChatHandoffService();
