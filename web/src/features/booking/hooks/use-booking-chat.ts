"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useReducer, useRef } from "react";

import {
  bookingChatReducer,
  createBookingChatState,
  getBookingChatFlags,
  type BookingChatStart,
} from "@/features/booking/state/booking-chat-state";
import type { PendingChatTurn, StructuredBookingFormValues } from "@/features/booking/types/booking-ui";
import { getBrowserTimeZone } from "@/features/booking/utils/booking-format";
import { mergeBookingMessages } from "@/features/booking/utils/chat-messages";
import { streamChatTurn } from "@/features/booking/utils/chat-stream";
import { useChatMessagePolling } from "@/features/conversations/hooks/use-chat-message-polling";
import { getListAppointmentsQueryKey } from "@/generated/api/appointments/appointments";
import {
  getListMessagesQueryKey,
  getListSessionsQueryKey,
  useConfirmBooking,
  useCreateMessage,
  useCreateSession,
} from "@/generated/api/chat/chat";
import type { ChatAction, ChatTurnResponse, ProcessChatMessageRequest } from "@/generated/api/models";
import { getApiErrorMessage, isApiError } from "@/lib/api/api-error";

interface UseBookingChatOptions extends BookingChatStart {
  businessSlug: string;
  /** Where polling for new messages starts when resuming a chat. */
  initialMessageCursor?: string | undefined;
  onSessionCreated?: ((sessionId: string) => void) | undefined;
}

/**
 * Runs the booking chat: sends messages (streaming the reply), retries a
 * failed one, confirms the booking and keeps the cached lists current.
 * The screen's state lives in one reducer; see booking-chat-state.ts.
 */
export function useBookingChat({
  businessSlug,
  initialMessageCursor,
  onSessionCreated,
  ...start
}: UseBookingChatOptions) {
  const queryClient = useQueryClient();
  const createSessionMutation = useCreateSession();
  const createMessageMutation = useCreateMessage();
  const confirmBookingMutation = useConfirmBooking();
  const [state, dispatch] = useReducer(bookingChatReducer, start, createBookingChatState);
  // State updates land on the next render; these stop a double click sending twice before then.
  const messageRequestLockRef = useRef(false);
  const confirmationRequestLockRef = useRef(false);
  const flags = getBookingChatFlags(state);
  const isConfirming = confirmBookingMutation.isPending;
  const messagePollingQuery = useChatMessagePolling(state.sessionId ?? "", {
    enabled: state.sessionId !== null && !flags.isBooked,
    ...(initialMessageCursor ? { initialCursor: initialMessageCursor } : {}),
  });
  const visibleMessages = useMemo(
    () => mergeBookingMessages(state.messages, messagePollingQuery.data?.items ?? []),
    [messagePollingQuery.data?.items, state.messages],
  );

  /**
   * Streams the reply when the API supports it. If the stream can't open or
   * drops, the JSON endpoint returns the same turn: the message id makes the
   * request idempotent, so nothing is processed twice.
   */
  async function sendTurn(sessionId: string, data: ProcessChatMessageRequest): Promise<ChatTurnResponse> {
    dispatch({ type: "reply_started" });

    try {
      return await streamChatTurn(sessionId, data, {
        onStatus: (status) => dispatch({ type: "reply_status", status }),
        onToken: (text) => dispatch({ type: "reply_token", text }),
        onPart: (part) => dispatch({ type: "reply_part", part }),
      });
    } catch (error) {
      if (isApiError(error)) throw error;

      return createMessageMutation.mutateAsync({ data, sessionId });
    } finally {
      dispatch({ type: "reply_ended" });
    }
  }

  async function processTurn(turn: PendingChatTurn): Promise<boolean> {
    if (messageRequestLockRef.current || flags.isBooked) return false;

    const timeZone = getBrowserTimeZone();

    messageRequestLockRef.current = true;
    dispatch({ type: "turn_started", turn, timeZone });

    try {
      let sessionId = state.sessionId;
      const isNewSession = !sessionId;

      if (!sessionId) {
        const session = await createSessionMutation.mutateAsync({
          data: { businessSlug, title: turn.text.slice(0, 120) },
        });

        sessionId = session.id;
        dispatch({ type: "session_created", sessionId });
        onSessionCreated?.(sessionId);
      }

      const response = await sendTurn(sessionId, {
        clientMessageId: turn.clientMessageId,
        content: turn.text,
        timeZone,
        ...(turn.bookingDetails ? { bookingDetails: turn.bookingDetails } : {}),
        ...(turn.action ? { action: turn.action } : {}),
      });

      dispatch({ type: "turn_succeeded", turn, response });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(sessionId) }),
      ]);

      if (isNewSession) {
        window.history.replaceState(window.history.state, "", `/book?sessionId=${encodeURIComponent(sessionId)}`);
      }

      return true;
    } catch (error) {
      dispatch({
        type: "turn_failed",
        turn,
        error: getApiErrorMessage(error, "We could not process your message. Please try again or use the booking form."),
      });

      return false;
    } finally {
      messageRequestLockRef.current = false;
    }
  }

  function sendMessage(text: string) {
    const trimmedMessage = text.trim();

    if (!trimmedMessage || flags.isComposerDisabled || messageRequestLockRef.current) return;

    dispatch({ type: "composer_changed", text: "" });
    void processTurn({ clientMessageId: crypto.randomUUID(), text: trimmedMessage });
  }

  function retryPendingTurn() {
    if (state.pendingTurn && !state.isSending) void processTurn(state.pendingTurn);
  }

  /** A tap on a card or button in an assistant reply. */
  function handlePartAction(action: ChatAction, label: string) {
    if (action.type === "confirm_booking") {
      openConfirmation();
      return;
    }

    if (flags.isComposerDisabled || messageRequestLockRef.current) return;

    void processTurn({ action, clientMessageId: crypto.randomUUID(), text: label });
  }

  /** The structured form resends a failed message with its details, or sends a new one. */
  function submitStructuredBookingDetails(values: StructuredBookingFormValues): Promise<boolean> {
    if (state.isSending || flags.isBooked || messageRequestLockRef.current) return Promise.resolve(false);

    return processTurn(
      state.pendingTurn
        ? { ...state.pendingTurn, bookingDetails: values }
        : {
            bookingDetails: values,
            clientMessageId: crypto.randomUUID(),
            text: "I completed the structured booking form.",
          },
    );
  }

  function closeStructuredBookingForm() {
    if (!state.isSending) dispatch({ type: "dialog_closed" });
  }

  function openConfirmation() {
    if (flags.canConfirm && !isConfirming) dispatch({ type: "confirmation_opened" });
  }

  function closeConfirmation() {
    if (!isConfirming) dispatch({ type: "dialog_closed" });
  }

  function confirmBooking() {
    const { sessionId } = state;

    if (!sessionId || !flags.canConfirm || isConfirming || confirmationRequestLockRef.current) return;

    confirmationRequestLockRef.current = true;
    dispatch({ type: "confirmation_started" });
    confirmBookingMutation.mutate(
      { sessionId },
      {
        onError: (error) => {
          dispatch({
            type: "confirmation_failed",
            error: getApiErrorMessage(error, "The appointment could not be confirmed. Please try again."),
          });
        },
        onSettled: () => {
          confirmationRequestLockRef.current = false;
        },
        onSuccess: (response) => {
          dispatch({ type: "booking_confirmed", response });

          // A deposit is taken on Stripe's page; the booking is confirmed when it goes through.
          const checkoutUrl = response.appointment.payment?.checkoutUrl;

          if (checkoutUrl) window.location.assign(checkoutUrl);
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(sessionId) }),
          ]);
        },
      },
    );
  }

  return {
    state,
    ...flags,
    isConfirming,
    visibleMessages,
    setComposer: (text: string) => dispatch({ type: "composer_changed", text }),
    sendMessage,
    retryPendingTurn,
    handlePartAction,
    openStructuredBookingForm: () => dispatch({ type: "form_opened" }),
    closeStructuredBookingForm,
    submitStructuredBookingDetails,
    openConfirmation,
    closeConfirmation,
    confirmBooking,
  };
}
