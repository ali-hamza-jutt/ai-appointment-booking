"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { CheckboxField, TextField } from "@/components/ui/form-controls";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { SectionCard } from "@/components/ui/section-card";
import {
  AVAILABILITY_UI_CONSTANTS,
  WEEKDAYS,
} from "@/features/availability/constants/availability-ui.constants";
import {
  createShiftDraft,
  isOvernightShift,
  toWeeklyDraft,
  toWorkingHoursInput,
  type ShiftDraft,
  type WeeklyDraft,
} from "@/features/availability/utils/weekly-hours";
import {
  getListWorkingHoursQueryKey,
  useReplaceWorkingHours,
} from "@/generated/api/availability/availability";
import type { WorkingHoursResponse } from "@/generated/api/models";
import { getGetPublicAvailabilityQueryKey } from "@/generated/api/public-booking/public-booking";
import { getApiErrorMessage } from "@/lib/api/api-error";

interface WeeklyHoursEditorProps {
  businessId: string;
  businessSlug: string;
  canEdit: boolean;
  items: WorkingHoursResponse[];
  staffId: string;
  timeZone: string;
}

export function WeeklyHoursEditor({
  businessId,
  businessSlug,
  canEdit,
  items,
  staffId,
  timeZone,
}: WeeklyHoursEditorProps) {
  const queryClient = useQueryClient();
  const replaceMutation = useReplaceWorkingHours();
  const [draft, setDraft] = useState<WeeklyDraft>(() => toWeeklyDraft(items));
  const [saved, setSaved] = useState(false);

  function update(weekday: number, updater: (shifts: WeeklyDraft[number]) => WeeklyDraft[number]) {
    setSaved(false);
    setDraft((current) => ({ ...current, [weekday]: updater(current[weekday] ?? []) }));
  }

  function toggleDay(weekday: number, isWorking: boolean) {
    update(weekday, () =>
      isWorking
        ? [
            createShiftDraft(
              AVAILABILITY_UI_CONSTANTS.DEFAULT_SHIFT.startTime,
              AVAILABILITY_UI_CONSTANTS.DEFAULT_SHIFT.endTime,
            ),
          ]
        : [],
    );
  }

  function copyMondayToWeekdays() {
    const monday = draft[1] ?? [];

    setSaved(false);
    setDraft((current) => {
      const next = { ...current };

      for (const weekday of AVAILABILITY_UI_CONSTANTS.WEEKDAY_VALUES) {
        next[weekday] = monday.map((shift) =>
          createShiftDraft(shift.startTime, shift.endTime),
        );
      }

      return next;
    });
  }

  function save() {
    replaceMutation.mutate(
      { businessId, staffId, data: { items: toWorkingHoursInput(draft) } },
      {
        onSuccess: (response) => {
          queryClient.setQueryData(getListWorkingHoursQueryKey(businessId, staffId), response);
          void queryClient.invalidateQueries({
            queryKey: getGetPublicAvailabilityQueryKey(businessSlug),
          });
          setSaved(true);
        },
      },
    );
  }

  return (
    <SectionCard
      actions={
        canEdit ? (
          <Button onClick={copyMondayToWeekdays} size="sm" variant="secondary">
            Copy Monday to weekdays
          </Button>
        ) : null
      }
      description={`Times are in ${timeZone.replaceAll("_", " ")}. Add a second shift to create a break.`}
      footer={
        canEdit ? (
          <Button isLoading={replaceMutation.isPending} onClick={save}>
            Save hours
          </Button>
        ) : null
      }
      title="Weekly hours"
    >
      {replaceMutation.error ? (
        <Alert className="mb-4" tone="danger">
          {getApiErrorMessage(replaceMutation.error, "Working hours could not be saved.")}
        </Alert>
      ) : saved ? (
        <Alert className="mb-4" tone="success">Working hours saved.</Alert>
      ) : null}

      <ul className="divide-y divide-border">
        {WEEKDAYS.map((day) => {
          const shifts = draft[day.value] ?? [];

          return (
            <li
              className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[8rem_1fr]"
              key={day.value}
            >
              <div className="sm:pt-2.5">
                <CheckboxField
                  checked={shifts.length > 0}
                  disabled={!canEdit}
                  id={`day-${day.value}`}
                  label={day.label}
                  onChange={(event) => toggleDay(day.value, event.target.checked)}
                />
              </div>
              <div className="min-w-0 space-y-2">
                {shifts.length === 0 ? (
                  <p className="text-sm text-subtle sm:pt-2.5">Unavailable</p>
                ) : (
                  shifts.map((shift, index) => (
                    <ShiftRow
                      canEdit={canEdit}
                      dayLabel={day.label}
                      index={index}
                      key={shift.key}
                      onChange={(changes) =>
                        update(day.value, (current) =>
                          current.map((item) =>
                            item.key === shift.key ? { ...item, ...changes } : item,
                          ),
                        )
                      }
                      onRemove={() =>
                        update(day.value, (current) =>
                          current.filter((item) => item.key !== shift.key),
                        )
                      }
                      shift={shift}
                    />
                  ))
                )}
                {canEdit && shifts.length > 0 ? (
                  <Button
                    leadingIcon={<PlusIcon className="size-4" />}
                    onClick={() =>
                      update(day.value, (current) => [
                        ...current,
                        createShiftDraft(current.at(-1)?.endTime ?? "13:00", "18:00"),
                      ])
                    }
                    size="sm"
                    variant="ghost"
                  >
                    Add shift
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function ShiftRow({
  canEdit,
  dayLabel,
  index,
  onChange,
  onRemove,
  shift,
}: {
  canEdit: boolean;
  dayLabel: string;
  index: number;
  onChange: (changes: Partial<ShiftDraft>) => void;
  onRemove: () => void;
  shift: ShiftDraft;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-36 shrink-0">
        <TextField
          disabled={!canEdit}
          hideLabel
          id={`${shift.key}-start`}
          label={`${dayLabel} shift ${index + 1} start`}
          onChange={(event) => onChange({ startTime: event.target.value })}
          type="time"
          value={shift.startTime}
        />
      </div>
      <span className="text-sm text-muted">to</span>
      <div className="w-36 shrink-0">
        <TextField
          disabled={!canEdit}
          hideLabel
          id={`${shift.key}-end`}
          label={`${dayLabel} shift ${index + 1} end`}
          onChange={(event) => onChange({ endTime: event.target.value })}
          type="time"
          value={shift.endTime}
        />
      </div>
      {isOvernightShift(shift) ? (
        <span className="text-xs font-medium text-warning-strong">next day</span>
      ) : null}
      {canEdit ? (
        <Button
          aria-label={`Remove ${dayLabel} shift ${index + 1}`}
          onClick={onRemove}
          size="sm"
          variant="ghost"
        >
          <TrashIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
