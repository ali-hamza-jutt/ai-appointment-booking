"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { SectionCard } from "@/components/ui/section-card";
import {
  getListTimeOffQueryKey,
  useCreateTimeOff,
  useDeleteTimeOff,
  useListTimeOff,
} from "@/generated/api/availability/availability";
import { getGetPublicAvailabilityQueryKey } from "@/generated/api/public-booking/public-booking";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  formatDateTime,
  getCurrentLocalDate,
  zonedDateTimeToIso,
} from "@/lib/utils/date-time";

interface TimeOffPanelProps {
  businessId: string;
  businessSlug: string;
  canEdit: boolean;
  staffId: string;
  timeZone: string;
}

export function TimeOffPanel({
  businessId,
  businessSlug,
  canEdit,
  staffId,
  timeZone,
}: TimeOffPanelProps) {
  const queryClient = useQueryClient();
  const timeOffQuery = useListTimeOff(businessId, staffId);
  const deleteMutation = useDeleteTimeOff();
  const [isAddOpen, setIsAddOpen] = useState(false);

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: getListTimeOffQueryKey(businessId, staffId),
    });
    void queryClient.invalidateQueries({
      queryKey: getGetPublicAvailabilityQueryKey(businessSlug),
    });
  }

  return (
    <SectionCard
      actions={
        canEdit ? (
          <Button
            leadingIcon={<PlusIcon className="size-4" />}
            onClick={() => setIsAddOpen(true)}
            size="sm"
            variant="secondary"
          >
            Add time off
          </Button>
        ) : null
      }
      description="Holidays, sick days or appointments when this person cannot be booked."
      title="Time off"
    >
      {deleteMutation.error ? (
        <Alert className="mb-4" tone="danger">
          {getApiErrorMessage(deleteMutation.error, "Time off could not be removed.")}
        </Alert>
      ) : null}
      {timeOffQuery.isPending ? (
        <Skeleton className="h-16 rounded-[10px]" />
      ) : timeOffQuery.isError ? (
        <Alert tone="danger">
          {getApiErrorMessage(timeOffQuery.error, "Time off could not be loaded.")}
        </Alert>
      ) : timeOffQuery.data.items.length === 0 ? (
        <p className="text-sm text-muted">No upcoming time off.</p>
      ) : (
        <ul className="divide-y divide-border">
          {timeOffQuery.data.items.map((entry) => (
            <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0" key={entry.id}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {formatDateTime(entry.startsAt, timeZone)} – {formatDateTime(entry.endsAt, timeZone)}
                </p>
                {entry.reason ? <p className="text-xs text-muted">{entry.reason}</p> : null}
              </div>
              {canEdit ? (
                <Button
                  aria-label="Remove time off"
                  disabled={deleteMutation.isPending}
                  onClick={() =>
                    deleteMutation.mutate(
                      { businessId, staffId, timeOffId: entry.id },
                      { onSuccess: refresh },
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  <TrashIcon className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isAddOpen ? (
        <AddTimeOffModal
          businessId={businessId}
          onClose={() => setIsAddOpen(false)}
          onCreated={() => {
            refresh();
            setIsAddOpen(false);
          }}
          staffId={staffId}
          timeZone={timeZone}
        />
      ) : null}
    </SectionCard>
  );
}

function AddTimeOffModal({
  businessId,
  onClose,
  onCreated,
  staffId,
  timeZone,
}: {
  businessId: string;
  onClose: () => void;
  onCreated: () => void;
  staffId: string;
  timeZone: string;
}) {
  const createMutation = useCreateTimeOff();
  const today = getCurrentLocalDate(timeZone);
  const [startDate, setStartDate] = useState(today);
  const [startTime, setStartTime] = useState("00:00");
  const [endDate, setEndDate] = useState(today);
  const [endTime, setEndTime] = useState("23:59");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const startsAt = zonedDateTimeToIso(startDate, startTime, timeZone);
    const endsAt = zonedDateTimeToIso(endDate, endTime, timeZone);

    if (!startsAt || !endsAt || endsAt <= startsAt) {
      setFormError("Choose an end after the start.");
      return;
    }

    setFormError(null);
    createMutation.mutate(
      {
        businessId,
        staffId,
        data: { startsAt, endsAt, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      },
      { onSuccess: onCreated },
    );
  }

  return (
    <Modal
      description={`Times are in ${timeZone.replaceAll("_", " ")}.`}
      isOpen
      onClose={onClose}
      title="Add time off"
    >
      <form className="space-y-5 p-5 sm:p-6" noValidate onSubmit={handleSubmit}>
        {formError || createMutation.error ? (
          <Alert tone="danger">
            {formError ?? getApiErrorMessage(createMutation.error, "Time off could not be added.")}
          </Alert>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="time-off-start-date"
            label="From date"
            onChange={(event) => setStartDate(event.target.value)}
            type="date"
            value={startDate}
          />
          <TextField
            id="time-off-start-time"
            label="From time"
            onChange={(event) => setStartTime(event.target.value)}
            type="time"
            value={startTime}
          />
          <TextField
            id="time-off-end-date"
            label="Until date"
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
            type="date"
            value={endDate}
          />
          <TextField
            id="time-off-end-time"
            label="Until time"
            onChange={(event) => setEndTime(event.target.value)}
            type="time"
            value={endTime}
          />
        </div>
        <TextField
          id="time-off-reason"
          label="Reason (optional)"
          maxLength={200}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Annual leave"
          value={reason}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button isLoading={createMutation.isPending} type="submit">
            Add time off
          </Button>
        </div>
      </form>
    </Modal>
  );
}
