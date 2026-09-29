import { describe, expect, it } from "vitest";

import {
  bookingChatReducer,
  createBookingChatState,
  getBookingChatFlags,
  type BookingChatAction,
  type BookingChatState,
} from "@/features/booking/state/booking-chat-state";
import type { PendingChatTurn } from "@/features/booking/types/booking-ui";
import type {
  AppointmentResponse,
  ChatBookingDraft,
  ChatMessageResponse,
  ChatSessionResponse,
} from "@/generated/api/models";

const TIME_ZONE = "Europe/London";
const turn: PendingChatTurn = { clientMessageId: "client-1", text: "A haircut on Friday at 10" };

const emptyDraft: ChatBookingDraft = { service: null, staff: null, hold: null, timeZone: null, notes: null };
const heldDraft: ChatBookingDraft = {
  ...emptyDraft,
  hold: {
    bookingId: "booking-1",
    serviceName: "Haircut",
    staffName: "Sam",
    startsAt: "2030-01-04T10:00:00.000Z",
    endsAt: "2030-01-04T10:30:00.000Z",
    durationMinutes: 30,
    priceMinor: 2_500,
    currency: "GBP",
    status: "HELD",
    holdExpiresAt: "2030-01-04T09:00:00.000Z",
    timeZone: TIME_ZONE,
  },
};

function session(overrides: Partial<ChatSessionResponse> = {}): ChatSessionResponse {
  return {
    id: "session-1",
    business: { id: "business-1", name: "Glow Salon", slug: "glow" },
    title: null,
    status: "ACTIVE",
    channel: "WEB",
    draft: emptyDraft,
    handoff: null,
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessageResponse>): ChatMessageResponse {
  return {
    id: "message-1",
    sessionId: "session-1",
    clientMessageId: null,
    replyToMessageId: null,
    role: "ASSISTANT",
    content: "",
    structuredData: null,
    createdAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function appointment(overrides: Partial<AppointmentResponse> = {}): AppointmentResponse {
  return {
    id: "booking-1",
    business: { id: "business-1", name: "Glow Salon", slug: "glow" },
    serviceId: "service-1",
    serviceName: "Haircut",
    staff: null,
    scheduledAt: "2030-01-04T10:00:00.000Z",
    endsAt: "2030-01-04T10:30:00.000Z",
    timeZone: TIME_ZONE,
    durationMinutes: 30,
    status: "CONFIRMED",
    source: "CHAT",
    notes: null,
    priceMinor: null,
    currency: null,
    holdExpiresAt: null,
    cancelReason: null,
    rescheduleCount: 0,
    canCancel: true,
    canReschedule: true,
    payment: null,
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function run(state: BookingChatState, ...actions: BookingChatAction[]): BookingChatState {
  return actions.reduce(bookingChatReducer, state);
}

const newChat = () => createBookingChatState({ firstName: "Ayesha", timeZone: TIME_ZONE });

const reply = {
  type: "turn_succeeded",
  turn,
  response: {
    session: session({ draft: heldDraft }),
    userMessage: message({ id: "user-1", role: "USER", clientMessageId: "client-1", content: "A haircut on Friday at 10" }),
    assistantMessage: message({ id: "assistant-1", content: "Friday at 10 is free. Shall I book it?" }),
  },
} as const satisfies BookingChatAction;

describe("booking chat state", () => {
  it("greets a new chat and resumes a saved one where it left off", () => {
    expect(newChat()).toMatchObject({
      sessionId: null,
      messages: [{ id: "welcome", text: expect.stringContaining("Hi Ayesha!") }],
      draft: null,
      missingFields: ["serviceName", "scheduledAt"],
      outcome: null,
    });

    const resumed = createBookingChatState({
      firstName: "Ayesha",
      messages: [
        message({ id: "m1", role: "USER", content: "Hi", clientMessageId: "c1" }),
        message({ id: "m2", role: "SYSTEM", content: "Booking held." }),
        message({ id: "m3", content: "Friday at 10 is free." }),
      ],
      session: session({ draft: heldDraft }),
      timeZone: TIME_ZONE,
    });

    // System messages aren't shown; a held slot is ready to confirm.
    expect(resumed.messages.map((shown) => shown.id)).toEqual(["m1", "m3"]);
    expect(resumed).toMatchObject({ sessionId: "session-1", isReadyToConfirm: true, missingFields: [] });
    expect(resumed.draft).toMatchObject({ title: "Haircut", staff: "Sam" });

    const booked = createBookingChatState({ firstName: "Ayesha", session: session({ status: "CLOSED" }), timeZone: TIME_ZONE });

    expect(getBookingChatFlags(booked)).toMatchObject({ isBooked: true, isComposerDisabled: true });
  });

  it("shows a message at once, streams the reply, then shows the saved turn", () => {
    const sending = run(newChat(), { type: "turn_started", turn, timeZone: TIME_ZONE }, { type: "session_created", sessionId: "session-1" });

    expect(sending.messages.at(-1)).toMatchObject({ id: "pending-client-1", deliveryStatus: "sending", role: "user" });
    expect(getBookingChatFlags(sending)).toMatchObject({ isComposerDisabled: true, canConfirm: false });

    const streaming = run(
      sending,
      { type: "reply_started" },
      { type: "reply_token", text: "Let me " },
      { type: "reply_status", status: "Checking Friday…" },
      { type: "reply_token", text: "Friday " },
      { type: "reply_token", text: "is free." },
    );

    // A status replaces the text streamed before it.
    expect(streaming.liveReply).toEqual({ status: "Checking Friday…", text: "Friday is free.", parts: [] });

    const done = run(streaming, { type: "reply_ended" }, reply);

    expect(done.liveReply).toBeNull();
    expect(done.messages.map((shown) => [shown.id, shown.deliveryStatus])).toEqual([
      ["welcome", undefined],
      ["pending-client-1", "sent"],
      ["assistant-1", undefined],
    ]);
    expect(done).toMatchObject({ isSending: false, pendingTurn: null, isReadyToConfirm: true, missingFields: [] });
    expect(getBookingChatFlags(done)).toMatchObject({ isComposerDisabled: false, canConfirm: true });

    // The same reply arriving again (say, from the fallback request) isn't shown twice.
    expect(run(done, reply).messages).toHaveLength(3);
  });

  it("keeps a failed message so it can be retried or finished in the form", () => {
    const failed = run(
      newChat(),
      { type: "turn_started", turn, timeZone: TIME_ZONE },
      { type: "turn_failed", turn, error: "The assistant is busy." },
    );

    expect(failed).toMatchObject({ isSending: false, pendingTurn: turn, requestError: "The assistant is busy." });
    expect(failed.messages.at(-1)).toMatchObject({ deliveryStatus: "failed" });
    // Nothing new can be typed until the failed message is dealt with.
    expect(getBookingChatFlags(failed)).toMatchObject({ hasFailedTurn: true, isComposerDisabled: true });

    const retried = run(failed, { type: "turn_started", turn, timeZone: TIME_ZONE });

    expect(retried.messages.filter((shown) => shown.clientMessageId === "client-1")).toHaveLength(1);
    expect(retried).toMatchObject({ requestError: null, isSending: true });

    const withForm = run(failed, { type: "form_opened" });

    expect(withForm).toMatchObject({ dialog: "form", requestError: null });
  });

  it("opens the form only while the chat can still change", () => {
    const sending = run(newChat(), { type: "turn_started", turn, timeZone: TIME_ZONE });

    expect(run(sending, { type: "form_opened" }).dialog).toBeNull();
    expect(run(newChat(), { type: "form_opened" }, { type: "dialog_closed" }).dialog).toBeNull();
  });

  it("confirms the booking, closing the dialog and making the chat read-only", () => {
    const ready = run(newChat(), { type: "turn_started", turn, timeZone: TIME_ZONE }, { type: "session_created", sessionId: "session-1" }, reply);
    const failedOnce = run(
      ready,
      { type: "confirmation_opened" },
      { type: "confirmation_started" },
      { type: "confirmation_failed", error: "That time was just taken." },
    );

    expect(failedOnce).toMatchObject({ dialog: "confirm", confirmationError: "That time was just taken." });

    const booked = run(failedOnce, { type: "confirmation_started" }, {
      type: "booking_confirmed",
      response: {
        session: session({ status: "CLOSED", draft: heldDraft }),
        assistantMessage: message({ id: "assistant-2", content: "You're booked." }),
        appointment: appointment({ status: "PENDING" }),
      },
    });

    expect(booked).toMatchObject({ dialog: null, confirmationError: null, outcome: "awaiting_approval", isReadyToConfirm: false });
    expect(booked.messages.at(-1)).toMatchObject({ id: "assistant-2", text: "You're booked." });
    expect(booked.draft).toMatchObject({ title: "Haircut", heldUntil: null });
    expect(getBookingChatFlags(booked)).toMatchObject({ isBooked: true, isComposerDisabled: true, canConfirm: false });
  });
});
