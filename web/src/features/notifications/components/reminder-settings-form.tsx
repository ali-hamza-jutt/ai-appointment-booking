"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { CheckboxField, CheckboxList, TextField } from "@/components/ui/form-controls";
import { SectionCard } from "@/components/ui/section-card";
import {
  describeReminderOffset,
  NOTIFICATION_UI_CONSTANTS,
} from "@/features/notifications/constants/notification-ui.constants";
import {
  getGetBusinessQueryKey,
  useUpdateBusinessSettings,
} from "@/generated/api/businesses/businesses";
import type { BusinessResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";

const { DEFAULT_QUIET_HOURS, MAX_REMINDERS, REMINDER_OPTIONS } = NOTIFICATION_UI_CONSTANTS;

/** When reminders go out, and the hours they wait out. */
export function ReminderSettingsForm({ business, canEdit }: { business: BusinessResponse; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const updateMutation = useUpdateBusinessSettings();
  const { settings } = business;
  const [offsets, setOffsets] = useState(settings.reminderOffsetsMinutes.map(String));
  const [quietEnabled, setQuietEnabled] = useState(settings.quietHoursStart !== settings.quietHoursEnd);
  const [quietStart, setQuietStart] = useState(
    settings.quietHoursStart !== settings.quietHoursEnd ? settings.quietHoursStart : DEFAULT_QUIET_HOURS.START,
  );
  const [quietEnd, setQuietEnd] = useState(
    settings.quietHoursStart !== settings.quietHoursEnd ? settings.quietHoursEnd : DEFAULT_QUIET_HOURS.END,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Offsets set through the API that aren't presets still show up, so saving never drops them silently.
  const options = [...new Set([...REMINDER_OPTIONS, ...settings.reminderOffsetsMinutes])]
    .sort((a, b) => b - a)
    .map((minutes) => ({ label: describeReminderOffset(minutes), value: String(minutes) }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);

    if (offsets.length > MAX_REMINDERS) {
      setError(`Choose up to ${MAX_REMINDERS} reminders.`);
      return;
    }

    if (quietEnabled && quietStart === quietEnd) {
      setError("Quiet hours need different start and end times.");
      return;
    }

    setError(null);
    updateMutation.mutate(
      {
        businessId: business.id,
        data: {
          reminderOffsetsMinutes: offsets.map(Number),
          // Equal times turn quiet hours off.
          quietHoursStart: quietEnabled ? quietStart : "00:00",
          quietHoursEnd: quietEnabled ? quietEnd : "00:00",
        },
      },
      {
        onSuccess: (response) => {
          queryClient.setQueryData(getGetBusinessQueryKey(business.id), response);
          setSaved(true);
        },
      },
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <SectionCard
        description="Customers get a reminder by email, and by text when they have a mobile number, before each confirmed booking."
        footer={
          canEdit ? (
            <Button isLoading={updateMutation.isPending} type="submit">
              Save reminders
            </Button>
          ) : null
        }
        title="Reminders"
      >
        <div className="space-y-5">
          {error || updateMutation.error ? (
            <Alert tone="danger">
              {error ?? getApiErrorMessage(updateMutation.error, "Reminder settings could not be saved.")}
            </Alert>
          ) : saved ? (
            <Alert tone="success">Reminder settings saved.</Alert>
          ) : null}

          <fieldset disabled={!canEdit}>
            <CheckboxList
              hint={`Pick up to ${MAX_REMINDERS}. Bookings made later than a reminder's time skip that reminder.`}
              id="reminder-offsets"
              label="Send reminders"
              onChange={setOffsets}
              options={options}
              values={offsets}
            />
          </fieldset>

          <div className="space-y-4 border-t border-border pt-5">
            <CheckboxField
              checked={quietEnabled}
              disabled={!canEdit}
              hint="A reminder that falls in these hours (in the customer's time zone) goes out when they start instead, for example the evening before an early appointment."
              id="quiet-hours-enabled"
              label="Hold reminders during quiet hours"
              onChange={(event) => setQuietEnabled(event.target.checked)}
            />
            {quietEnabled ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  disabled={!canEdit}
                  id="quiet-hours-start"
                  label="Quiet from"
                  onChange={(event) => setQuietStart(event.target.value)}
                  type="time"
                  value={quietStart}
                />
                <TextField
                  disabled={!canEdit}
                  id="quiet-hours-end"
                  label="Quiet until"
                  onChange={(event) => setQuietEnd(event.target.value)}
                  type="time"
                  value={quietEnd}
                />
              </div>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </form>
  );
}
