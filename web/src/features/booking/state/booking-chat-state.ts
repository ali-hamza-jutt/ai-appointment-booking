import type {
  BookingDraftViewModel,
  ChatMessageDeliveryStatus,
  ChatMessageViewModel,
  LiveReplyViewModel,
  PendingChatTurn,
} from "@/features/booking/types/booking-ui";
import {
  getMissingDraftFields,
  mergeLivePart,
  toBookingDraft,
  toConfirmedBookingDraft,
} from "@/features/booking/utils/booking-format";
import {
  appendAssistantMessage,
  createWelcomeMessage,
  isBookingMessage,
  toBookingMessageViewModel,
} from "@/features/booking/utils/chat-messages";
import type {
  ChatBookingDraft,
  ChatMessagePart,
  ChatMessageResponse,
  ChatSessionResponse,
  ChatTurnResponse,
  ConfirmChatBookingResponse,
} from "@/generated/api/models";

/**
 * Everything the booking chat tracks on the client. The server owns the
 * conversation and the draft; this is the screen's copy between requests,
 * plus what only the screen knows (the composer, a reply as it streams,
 * a failed message waiting to be retried, which dialog is open).
 */
export interface BookingChatState {
  sessionId: string | null;
  messages: ChatMessageViewModel[];
  composer: string;
  /** The server's draft, which the structured form starts from. */
  sessionDraft: ChatBookingDraft | null;
  /** The side panel's view of the draft, or of the booking once it is made. */
  draft: BookingDraftViewModel | null;
  missingFields: string[];
  isReadyToConfirm: boolean;
  timeZone: string;
  /** From sending a message until its reply is saved or it fails. */
  isSending: boolean;
  /** The assistant's reply while it streams in. */
  liveReply: LiveReplyViewModel | null;
  /** The message being sent; kept after a failure so it can be retried. */
  pendingTurn: PendingChatTurn | null;
  requestError: string | null;
  confirmationError: string | null;
  dialog: "confirm" | "form" | null;
  /** Set once the booking is made; the chat is then read-only. */
  outcome: "booked" | "awaiting_approval" | null;
}

export type BookingChatAction =
  | { type: "composer_changed"; text: string }
  | { type: "turn_started"; turn: PendingChatTurn; timeZone: string }
  | { type: "session_created"; sessionId: string }
  | { type: "reply_started" }
  | { type: "reply_status"; status: string }
  | { type: "reply_token"; text: string }
  | { type: "reply_part"; part: ChatMessagePart }
  | { type: "reply_ended" }
  | { type: "turn_succeeded"; turn: PendingChatTurn; response: ChatTurnResponse }
  | { type: "turn_failed"; turn: PendingChatTurn; error: string }
  | { type: "form_opened" }
  | { type: "confirmation_opened" }
  | { type: "dialog_closed" }
  | { type: "confirmation_started" }
  | { type: "confirmation_failed"; error: string }
  | { type: "booking_confirmed"; response: ConfirmChatBookingResponse };

export interface BookingChatStart {
  firstName: string;
  /** Saved messages when resuming a chat. */
  messages?: ChatMessageResponse[];
  session?: ChatSessionResponse;
  timeZone: string;
}

export function createBookingChatState({ firstName, messages = [], session, timeZone }: BookingChatStart): BookingChatState {
  const savedMessages = messages.filter(isBookingMessage).map(toBookingMessageViewModel);

  return {
    sessionId: session?.id ?? null,
    messages: savedMessages.length > 0 ? savedMessages : [createWelcomeMessage(firstName)],
    composer: "",
    sessionDraft: session?.draft ?? null,
    draft: toBookingDraft(session?.draft, timeZone),
    missingFields: getMissingDraftFields(session?.draft),
    isReadyToConfirm: session?.status === "ACTIVE" && Boolean(session.draft.hold),
    timeZone,
    isSending: false,
    liveReply: null,
    pendingTurn: null,
    requestError: null,
    confirmationError: null,
    dialog: null,
    outcome: session?.status === "CLOSED" ? "booked" : null,
  };
}

export function bookingChatReducer(state: BookingChatState, action: BookingChatAction): BookingChatState {
  switch (action.type) {
    case "composer_changed":
      return { ...state, composer: action.text };

    case "turn_started":
      return {
        ...state,
        isSending: true,
        pendingTurn: action.turn,
        requestError: null,
        isReadyToConfirm: false,
        timeZone: action.timeZone,
        messages: showTurn(state.messages, action.turn, "sending"),
      };

    case "session_created":
      return { ...state, sessionId: action.sessionId };

    case "reply_started":
      return { ...state, liveReply: { status: null, text: "", parts: [] } };

    case "reply_status":
      // A new status replaces any text streamed so far.
      return { ...state, liveReply: { status: action.status, text: "", parts: state.liveReply?.parts ?? [] } };

    case "reply_token":
      return {
        ...state,
        liveReply: {
          status: state.liveReply?.status ?? null,
          text: `${state.liveReply?.text ?? ""}${action.text}`,
          parts: state.liveReply?.parts ?? [],
        },
      };

    case "reply_part":
      return {
        ...state,
        liveReply: {
          status: state.liveReply?.status ?? null,
          text: state.liveReply?.text ?? "",
          parts: mergeLivePart(state.liveReply?.parts ?? [], action.part),
        },
      };

    case "reply_ended":
      return { ...state, liveReply: null };

    case "turn_succeeded": {
      const { response, turn } = action;
      const delivered = state.messages.map((message) =>
        message.clientMessageId === turn.clientMessageId
          ? { ...message, deliveryStatus: "sent" as const, text: response.userMessage.content }
          : message,
      );

      return {
        ...state,
        isSending: false,
        pendingTurn: null,
        messages: appendAssistantMessage(delivered, response.assistantMessage),
        sessionDraft: response.session.draft,
        draft: toBookingDraft(response.session.draft, state.timeZone),
        missingFields: getMissingDraftFields(response.session.draft),
        isReadyToConfirm: Boolean(response.session.draft.hold),
        confirmationError: null,
      };
    }

    case "turn_failed":
      return {
        ...state,
        isSending: false,
        requestError: action.error,
        messages: showTurn(state.messages, action.turn, "failed"),
      };

    case "form_opened":
      if (state.isSending || state.outcome) return state;

      return { ...state, requestError: null, dialog: "form" };

    case "confirmation_opened":
      return { ...state, confirmationError: null, dialog: "confirm" };

    case "dialog_closed":
      return { ...state, confirmationError: null, dialog: null };

    case "confirmation_started":
      return { ...state, confirmationError: null };

    case "confirmation_failed":
      return { ...state, confirmationError: action.error };

    case "booking_confirmed": {
      const { response } = action;

      return {
        ...state,
        messages: appendAssistantMessage(state.messages, response.assistantMessage),
        draft: toConfirmedBookingDraft(response.appointment),
        sessionDraft: response.session.draft,
        isReadyToConfirm: false,
        outcome: response.appointment.status === "PENDING" ? "awaiting_approval" : "booked",
        dialog: null,
      };
    }
  }
}

/** What the screen allows right now, worked out from the state. */
export function getBookingChatFlags(state: BookingChatState) {
  const isBooked = state.outcome !== null;
  const hasFailedTurn = state.pendingTurn !== null && !state.isSending;

  return {
    isBooked,
    hasFailedTurn,
    isComposerDisabled: state.isSending || hasFailedTurn || isBooked,
    canConfirm:
      state.sessionId !== null && state.draft !== null && state.isReadyToConfirm && !state.isSending && !isBooked,
  };
}

/** Shows the customer's message with its delivery status, adding it the first time. */
function showTurn(
  messages: ChatMessageViewModel[],
  turn: PendingChatTurn,
  deliveryStatus: ChatMessageDeliveryStatus,
): ChatMessageViewModel[] {
  if (messages.some((message) => message.clientMessageId === turn.clientMessageId)) {
    return messages.map((message) =>
      message.clientMessageId === turn.clientMessageId ? { ...message, deliveryStatus } : message,
    );
  }

  return [
    ...messages,
    {
      clientMessageId: turn.clientMessageId,
      deliveryStatus,
      id: `pending-${turn.clientMessageId}`,
      role: "user",
      text: turn.text,
    },
  ];
}
