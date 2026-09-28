"use client";

import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { ClockIcon } from "@/components/ui/icons";
import { describeWaitlistWindow } from "@/features/waitlist/utils/waitlist-format";
import {
  getListMyWaitlistQueryKey,
  useLeaveWaitlist,
  useListMyWaitlist,
} from "@/generated/api/waitlist/waitlist";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDateTime } from "@/lib/utils/date-time";

/** The customer's waits: what they are waiting for, and a held time to confirm when one opened up. */
export function MyWaitlist() {
  const queryClient = useQueryClient();
  const waitlistQuery = useListMyWaitlist();
  const leaveMutation = useLeaveWaitlist({
    mutation: { onSettled: () => queryClient.invalidateQueries({ queryKey: getListMyWaitlistQueryKey() }) },
  });
  const entries = waitlistQuery.data?.items ?? [];

  if (entries.length === 0) return null;

  return (
    <section className="mt-10">
      <h3 className="text-base font-semibold text-ink">Waitlist</h3>
      <p className="mt-1 text-sm text-muted">
        If a time opens up, it is held for you for 15 minutes and we message you a link to confirm it.
      </p>
      {leaveMutation.error ? (
        <Alert className="mt-3" tone="danger">
          {getApiErrorMessage(leaveMutation.error, "You could not be taken off the waitlist. Please try again.")}
        </Alert>
      ) : null}
      <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
        {entries.map((entry) => (
          <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={entry.id}>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {entry.service.name}
                {entry.staff ? <span className="font-normal text-muted"> with {entry.staff.name}</span> : null}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {entry.business.name} · {describeWaitlistWindow(entry)}
              </p>
              {entry.offer ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ink">
                  <ClockIcon className="size-3.5" />
                  {formatDateTime(entry.offer.startsAt, entry.timeZone)} is held for you until{" "}
                  {formatDateTime(entry.offer.expiresAt, entry.timeZone)}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {entry.offer ? (
                <LinkButton href={`/appointments/${entry.offer.bookingId}`} size="sm">
                  Confirm time
                </LinkButton>
              ) : (
                <Badge tone="neutral">Waiting</Badge>
              )}
              <Button
                isLoading={leaveMutation.isPending && leaveMutation.variables?.entryId === entry.id}
                onClick={() => leaveMutation.mutate({ entryId: entry.id })}
                size="sm"
                variant="ghost"
              >
                Leave
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
