"use client";

import { Badge } from "@/components/ui/badge";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { NOTIFICATION_UI_CONSTANTS } from "@/features/notifications/constants/notification-ui.constants";
import { useListBookingNotifications } from "@/generated/api/notifications/notifications";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDateTime } from "@/lib/utils/date-time";

const { CHANNEL_LABELS, KIND_LABELS, STATUS_PRESENTATION } = NOTIFICATION_UI_CONSTANTS;

/** The emails and texts sent to the customer about one booking. */
export function BookingMessages({
  bookingId,
  businessId,
  timeZone,
}: {
  bookingId: string;
  businessId: string;
  timeZone: string;
}) {
  const messagesQuery = useListBookingNotifications(businessId, bookingId);

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Messages sent</h3>
      {messagesQuery.isPending ? (
        <Skeleton className="h-12 rounded-[10px]" />
      ) : messagesQuery.isError ? (
        <Alert tone="danger">{getApiErrorMessage(messagesQuery.error, "Messages could not be loaded.")}</Alert>
      ) : messagesQuery.data.items.length === 0 ? (
        <p className="text-xs text-muted">No messages yet.</p>
      ) : (
        <ul className="space-y-2">
          {messagesQuery.data.items.map((message) => {
            const status = STATUS_PRESENTATION[message.status];

            return (
              <li className="flex flex-wrap items-center justify-between gap-2 text-xs" key={message.id}>
                <span className="min-w-0 text-ink-soft">
                  <span className="font-semibold text-ink">{KIND_LABELS[message.kind]}</span> ·{" "}
                  {CHANNEL_LABELS[message.channel]} to {message.recipient} ·{" "}
                  {formatDateTime(message.sentAt ?? message.createdAt, timeZone)}
                  {message.error ? <span className="block text-danger">{message.error}</span> : null}
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
