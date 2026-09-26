"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { SectionCard } from "@/components/ui/section-card";
import {
  getListClosuresQueryKey,
  useCreateClosure,
  useDeleteClosure,
  useListClosures,
} from "@/generated/api/availability/availability";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";
import { formatLocalDateLabel, getCurrentLocalDate } from "@/lib/utils/date-time";

interface ClosuresPanelProps {
  businessId: string;
  canEdit: boolean;
  timeZone: string;
}

export function ClosuresPanel({ businessId, canEdit, timeZone }: ClosuresPanelProps) {
  const queryClient = useQueryClient();
  const closuresQuery = useListClosures(businessId);
  const createMutation = useCreateClosure();
  const deleteMutation = useDeleteClosure();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: getListClosuresQueryKey(businessId) });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!date) return;

    createMutation.mutate(
      { businessId, data: { date, ...(reason.trim() ? { reason: reason.trim() } : {}) } },
      {
        onSuccess: () => {
          setDate("");
          setReason("");
          refresh();
        },
      },
    );
  }

  return (
    <SectionCard
      description="Days the whole business is closed, such as public holidays."
      title="Closures"
    >
      {deleteMutation.error ? (
        <Alert className="mb-4" tone="danger">
          {getApiErrorMessage(deleteMutation.error, "The closure could not be removed.")}
        </Alert>
      ) : null}

      {closuresQuery.isPending ? (
        <Skeleton className="h-12 rounded-[10px]" />
      ) : closuresQuery.isError ? (
        <Alert tone="danger">
          {getApiErrorMessage(closuresQuery.error, "Closures could not be loaded.")}
        </Alert>
      ) : closuresQuery.data.items.length === 0 ? (
        <p className="text-sm text-muted">No upcoming closures.</p>
      ) : (
        <ul className="divide-y divide-border">
          {closuresQuery.data.items.map((closure) => (
            <li className="flex items-center gap-3 py-2.5 first:pt-0" key={closure.id}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{formatLocalDateLabel(closure.date)}</p>
                {closure.reason ? <p className="text-xs text-muted">{closure.reason}</p> : null}
              </div>
              {canEdit ? (
                <Button
                  aria-label={`Reopen ${closure.date}`}
                  disabled={deleteMutation.isPending}
                  onClick={() =>
                    deleteMutation.mutate(
                      { businessId, closureId: closure.id },
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

      {canEdit ? (
        <form
          className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end"
          noValidate
          onSubmit={handleSubmit}
        >
          <TextField
            error={getApiFieldError(createMutation.error, "date")}
            id="closure-date"
            label="Date"
            min={getCurrentLocalDate(timeZone)}
            onChange={(event) => setDate(event.target.value)}
            type="date"
            value={date}
          />
          <TextField
            id="closure-reason"
            label="Reason (optional)"
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Public holiday"
            value={reason}
          />
          <Button
            className="mb-px"
            disabled={!date}
            isLoading={createMutation.isPending}
            leadingIcon={<PlusIcon className="size-4" />}
            type="submit"
            variant="secondary"
          >
            Close day
          </Button>
        </form>
      ) : null}
    </SectionCard>
  );
}
