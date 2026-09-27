"use client";

import { useQueryClient } from "@tanstack/react-query";

import { Alert, Skeleton } from "@/components/ui/feedback";
import { CheckboxField } from "@/components/ui/form-controls";
import { SectionCard } from "@/components/ui/section-card";
import type { NotificationChannel } from "@/generated/api/models";
import {
  getListMySettingsQueryKey,
  useListMySettings,
  useUpdateMySetting,
} from "@/generated/api/notifications/notifications";
import { getApiErrorMessage } from "@/lib/api/api-error";

/** Per business: may it email or text the user about their bookings? */
export function MyNotificationSettings() {
  const queryClient = useQueryClient();
  const settingsQuery = useListMySettings();
  const updateMutation = useUpdateMySetting({
    mutation: {
      onSettled: () => queryClient.invalidateQueries({ queryKey: getListMySettingsQueryKey() }),
    },
  });
  const items = settingsQuery.data?.items ?? [];

  function isSaving(businessId: string, channel: NotificationChannel) {
    return (
      updateMutation.isPending &&
      updateMutation.variables?.businessId === businessId &&
      updateMutation.variables.data.channel === channel
    );
  }

  return (
    <SectionCard
      className="mt-5"
      description="Confirmations, changes and reminders for your bookings. Texts go to the mobile number you gave the business."
      title="Booking messages"
    >
      {settingsQuery.isPending ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : settingsQuery.isError ? (
        <Alert tone="danger">
          {getApiErrorMessage(settingsQuery.error, "Message settings could not be loaded.")}
        </Alert>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">You can choose here once you have booked with a business.</p>
      ) : (
        <div className="space-y-4">
          {updateMutation.isError ? (
            <Alert tone="danger">
              {getApiErrorMessage(updateMutation.error, "That change could not be saved. Please try again.")}
            </Alert>
          ) : null}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((item) => (
              <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" key={item.business.id}>
                <p className="text-sm font-semibold text-ink">{item.business.name}</p>
                <div className="flex flex-wrap gap-5">
                  {(["EMAIL", "SMS"] as const).map((channel) => (
                    <CheckboxField
                      checked={channel === "EMAIL" ? item.email : item.sms}
                      disabled={isSaving(item.business.id, channel)}
                      id={`notify-${item.business.id}-${channel}`}
                      key={channel}
                      label={channel === "EMAIL" ? "Email" : "Texts"}
                      onChange={(event) =>
                        updateMutation.mutate({
                          businessId: item.business.id,
                          data: { channel, optedIn: event.target.checked },
                        })
                      }
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
