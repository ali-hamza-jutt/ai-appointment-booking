import type { ChatMessageViewModel } from "@/features/booking/types/booking-ui";
import type { ChatMessageResponse } from "@/generated/api/models";

export type BookingMessageResponse = ChatMessageResponse & { role: "ASSISTANT" | "USER" };

export function createWelcomeMessage(firstName: string): ChatMessageViewModel {
  return {
    id: "welcome",
    role: "assistant",
    text: `Hi ${firstName}! Tell me what you would like to schedule, and I’ll help turn it into an appointment.`,
  };
}

/** Messages the customer sees: their own and the assistant's, not system or tool messages. */
export function isBookingMessage(message: ChatMessageResponse): message is BookingMessageResponse {
  return message.role === "ASSISTANT" || message.role === "USER";
}

export function toBookingMessageViewModel(message: BookingMessageResponse): ChatMessageViewModel {
  return {
    ...(message.clientMessageId ? { clientMessageId: message.clientMessageId } : {}),
    ...(message.role === "USER" ? { deliveryStatus: "sent" as const } : {}),
    id: message.id,
    ...(message.role === "ASSISTANT" && message.structuredData?.parts?.length
      ? { parts: message.structuredData.parts }
      : {}),
    role: message.role === "USER" ? "user" : "assistant",
    ...(message.structuredData?.sentBy ? { sentBy: message.structuredData.sentBy.name } : {}),
    text: message.content,
  };
}

/** Adds a saved assistant message unless it is already shown. */
export function appendAssistantMessage(
  messages: ChatMessageViewModel[],
  message: ChatMessageResponse,
): ChatMessageViewModel[] {
  if (messages.some((existing) => existing.id === message.id)) return messages;

  return [...messages, toBookingMessageViewModel({ ...message, role: "ASSISTANT" })];
}

/**
 * Lays messages that arrived by polling (such as a staff member's reply)
 * over the ones on screen, replacing optimistic copies by their client id.
 */
export function mergeBookingMessages(
  current: ChatMessageViewModel[],
  polledMessages: ChatMessageResponse[],
): ChatMessageViewModel[] {
  if (polledMessages.length === 0) return current;

  const mergedMessages = [...current];

  for (const polledMessage of polledMessages) {
    if (!isBookingMessage(polledMessage)) continue;

    const message = toBookingMessageViewModel(polledMessage);
    const existingIndex = mergedMessages.findIndex(
      (existingMessage) =>
        existingMessage.id === message.id ||
        (message.clientMessageId !== undefined && existingMessage.clientMessageId === message.clientMessageId),
    );

    if (existingIndex >= 0) {
      mergedMessages[existingIndex] = message;
    } else {
      mergedMessages.push(message);
    }
  }

  return mergedMessages;
}
