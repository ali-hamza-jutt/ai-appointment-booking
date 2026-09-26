import type {
  ChatMessagePart,
  ChatTurnResponse,
  ProcessChatMessageRequest,
} from "@/generated/api/models";
import { ApiError } from "@/lib/api/api-error";
import { openEventStream, StreamUnavailableError } from "@/lib/api/event-stream";

export interface ChatTurnStreamHandlers {
  /** What the assistant is doing; replaces any text streamed so far. */
  onStatus: (text: string) => void;
  onToken: (text: string) => void;
  onPart: (part: ChatMessagePart) => void;
}

interface StreamErrorPayload {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Sends a chat message and streams the reply as it is written. Resolves
 * with the persisted turn from the final `done` event.
 */
export async function streamChatTurn(
  sessionId: string,
  data: ProcessChatMessageRequest,
  handlers: ChatTurnStreamHandlers,
  signal?: AbortSignal,
): Promise<ChatTurnResponse> {
  const events = await openEventStream(`/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: data,
    ...(signal ? { signal } : {}),
  });

  for await (const event of events) {
    const payload: unknown = JSON.parse(event.data);

    switch (event.event) {
      case "status":
        handlers.onStatus((payload as { text: string }).text);
        break;
      case "token":
        handlers.onToken((payload as { text: string }).text);
        break;
      case "part":
        handlers.onPart((payload as { part: ChatMessagePart }).part);
        break;
      case "done":
        return payload as ChatTurnResponse;
      case "error": {
        const error = payload as StreamErrorPayload;

        throw new ApiError(error.statusCode, error.code, error.message, error.fieldErrors);
      }
    }
  }

  // The connection dropped before the reply was saved or sent.
  throw new StreamUnavailableError("The reply stream ended early");
}
