import { ERROR_CODES, ERROR_MESSAGES } from "../../constants/app.constants.js";
import { AppError } from "../../middleware/app-error.js";
import { assertUuid } from "../../utils/identifiers.js";
import { isPlaceholderEmail } from "../../utils/placeholder-email.js";
import { logger } from "../../config/logger.js";
import { messagingService } from "../messaging/messaging.service.js";
import { publishChatEvent } from "./chat-events.js";
import { chatService } from "./chat.service.js";
import { chatHandoffDal } from "./dal/chat-handoff.dal.js";
import type {
  ChatHandoffListResponse,
  ChatHandoffMessage,
  ChatHandoffResponse,
  ChatHandoffThreadResponse,
} from "./dto/chat-handoff.dto.js";

const MAX_OPEN_HANDOFFS = 100;
const THREAD_MESSAGES = 100;

type HandoffRecord = NonNullable<Awaited<ReturnType<typeof chatHandoffDal.findHandedOff>>>;
type MessageRecord = HandoffRecord["messages"][number];

function authorOf(structuredData: unknown): string | null {
  const sentBy = (structuredData as { sentBy?: { name?: unknown } } | null)?.sentBy;

  return typeof sentBy?.name === "string" ? sentBy.name : null;
}

/** Chats the assistant passed to a person, as the business sees them. */
export class ChatHandoffService {
  public async listOpen(businessId: string): Promise<ChatHandoffListResponse> {
    const sessions = await chatHandoffDal.listOpen(businessId, MAX_OPEN_HANDOFFS);

    return {
      items: sessions.map((session) => {
        const { messages, ...rest } = this.toThread(session);

        return { ...rest, recentMessages: messages };
      }),
    };
  }

  /** A handed-off chat in full, so staff can read what happened before replying. */
  public async getThread(businessId: string, sessionId: string): Promise<ChatHandoffThreadResponse> {
    return this.toThread(await this.getHandedOff(businessId, sessionId));
  }

  /**
   * Replies in the customer's chat as the business. The message shows the
   * staff member's first name, and the assistant reads it as the team's word.
   */
  public async reply(
    businessId: string,
    sessionId: string,
    staffUserId: string,
    content: string,
  ): Promise<ChatHandoffMessage> {
    const session = await this.getHandedOff(businessId, sessionId);

    if (session.handoffResolvedAt) {
      throw new AppError(409, ERROR_CODES.CHAT_HANDOFF_NOT_OPEN, ERROR_MESSAGES.CHAT_HANDOFF_NOT_OPEN);
    }

    const fullName = (await chatHandoffDal.findUserName(staffUserId)) ?? "";
    const name = fullName.trim().split(/\s+/)[0] || "The team";
    const message = await chatService.createAssistantMessage(session.userId, session.id, content, { sentBy: { name } });

    publishChatEvent({ type: "message", sessionId: session.id, businessId, messageId: message.id, role: "ASSISTANT" });

    try {
      await messagingService.relayStaffReply(session, name, session.business.name, message.content);
    } catch (error) {
      // The reply is saved either way; the customer sees it next time they open the chat.
      logger.warn({ err: error, sessionId: session.id }, "Texting a staff reply failed");
    }

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      sentBy: name,
      createdAt: message.createdAt,
    };
  }

  public async resolve(businessId: string, sessionId: string): Promise<void> {
    assertUuid("sessionId", sessionId);

    if (!(await chatHandoffDal.resolve(businessId, sessionId, new Date()))) {
      throw new AppError(404, ERROR_CODES.CHAT_SESSION_NOT_FOUND, ERROR_MESSAGES.CHAT_SESSION_NOT_FOUND);
    }

    publishChatEvent({ type: "handoff", sessionId, businessId, state: "resolved" });
  }

  private async getHandedOff(businessId: string, sessionId: string): Promise<HandoffRecord> {
    assertUuid("sessionId", sessionId);

    const session = await chatHandoffDal.findHandedOff(businessId, sessionId, THREAD_MESSAGES);

    if (!session) {
      throw new AppError(404, ERROR_CODES.CHAT_SESSION_NOT_FOUND, ERROR_MESSAGES.CHAT_SESSION_NOT_FOUND);
    }

    return session;
  }

  private toThread(session: HandoffRecord): Omit<ChatHandoffResponse, "recentMessages"> & { messages: ChatHandoffMessage[] } {
    return {
      sessionId: session.id,
      channel: session.channel,
      customer: {
        name: session.user.fullName,
        email: isPlaceholderEmail(session.user.email) ? null : session.user.email,
        phone: session.user.phone,
      },
      reason: session.handoffReason,
      requestedAt: session.handoffRequestedAt as Date,
      resolvedAt: session.handoffResolvedAt,
      messages: [...session.messages].reverse().map((message) => this.toMessage(message)),
    };
  }

  private toMessage(message: MessageRecord): ChatHandoffMessage {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      sentBy: message.role === "ASSISTANT" ? authorOf(message.structuredData) : null,
      createdAt: message.createdAt,
    };
  }
}

export const chatHandoffService = new ChatHandoffService();
