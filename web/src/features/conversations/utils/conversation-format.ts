import type { BadgeTone } from "@/components/ui/badge";
import type {
  ChatMessageResponse,
  ChatSessionResponse,
  ChatSessionStatus,
} from "@/generated/api/models";
import type {
  ConversationMessageViewModel,
  ConversationSessionViewModel,
} from "@/features/conversations/types/conversation-ui";

const statusPresentation: Record<
  ChatSessionStatus,
  { label: string; tone: BadgeTone }
> = {
  ACTIVE: { label: "Active", tone: "brand" },
  CLOSED: { label: "Closed", tone: "neutral" },
  ABANDONED: { label: "Abandoned", tone: "warning" },
};

export function toConversationSessionViewModel(
  session: ChatSessionResponse,
  timeZone: string,
): ConversationSessionViewModel {
  const updatedAt = new Date(session.updatedAt);
  const status = statusPresentation[session.status];

  return {
    dateLabel: formatDateTime(updatedAt, timeZone, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    id: session.id,
    preview: formatSessionPreview(session, timeZone),
    status: session.status,
    statusLabel: status.label,
    statusTone: status.tone,
    title:
      session.title?.trim() ||
      session.bookingContext?.serviceName?.trim() ||
      "Booking conversation",
  };
}

export function toConversationMessageViewModel(
  message: ChatMessageResponse,
  timeZone: string,
): ConversationMessageViewModel {
  const createdAt = new Date(message.createdAt);

  return {
    createdAt: message.createdAt,
    createdAtLabel: formatDateTime(createdAt, timeZone, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    id: message.id,
    role: message.role.toLowerCase() as ConversationMessageViewModel["role"],
    text: message.content,
    time: formatDateTime(createdAt, timeZone, { timeStyle: "short" }),
  };
}

function formatSessionPreview(
  session: ChatSessionResponse,
  timeZone: string,
): string {
  const {
    scheduledAt,
    serviceName,
    timeZone: bookingTimeZone,
  } = session.bookingContext ?? {};

  if (scheduledAt) {
    const dateLabel = formatDateTime(new Date(scheduledAt), bookingTimeZone ?? timeZone, {
      dateStyle: "medium",
      timeStyle: "short",
    });

    return serviceName ? `${serviceName} · ${dateLabel}` : dateLabel;
  }

  if (serviceName) return serviceName;

  if (session.status === "ACTIVE") {
    return "Continue this booking conversation";
  }

  return session.status === "ABANDONED"
    ? "Booking conversation abandoned"
    : "Booking conversation closed";
}

function formatDateTime(
  value: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  if (Number.isNaN(value.getTime())) return "Unavailable";

  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone,
  }).format(value);
}
