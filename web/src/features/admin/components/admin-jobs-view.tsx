"use client";

import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { CheckCircleIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import {
  getListFailedWorkQueryKey,
  useListFailedWork,
  useReplayOutboxEvent,
  useRetryFailedJob,
} from "@/generated/api/platform-admin/platform-admin";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDateTime } from "@/lib/utils/date-time";

/** Background work that gave up, and a way to run it again. */
export function AdminJobsView() {
  const queryClient = useQueryClient();
  const failedQuery = useListFailedWork();
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListFailedWorkQueryKey() });
  const retryMutation = useRetryFailedJob({ mutation: { onSuccess: refresh } });
  const replayMutation = useReplayOutboxEvent({ mutation: { onSuccess: refresh } });
  const data = failedQuery.data;

  return (
    <PageContainer size="wide">
      <PageHeader
        description="Jobs that ran out of retries, and booking events the relay gave up delivering. Running them again is recorded in the audit log."
        title="Failed jobs"
      />
      {retryMutation.error || replayMutation.error ? (
        <Alert className="mb-4" tone="danger">
          {getApiErrorMessage(retryMutation.error ?? replayMutation.error, "That didn't work. Refresh and try again.")}
        </Alert>
      ) : null}
      {failedQuery.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : failedQuery.isError || !data ? (
        <Alert tone="danger">{getApiErrorMessage(failedQuery.error, "Failed jobs could not be loaded.")}</Alert>
      ) : (
        <div className="space-y-6">
          <SectionCard title="Queue jobs">
            {!data.queuesAvailable ? (
              <Alert tone="info">Queues aren&apos;t configured on this server (REDIS_URL is not set).</Alert>
            ) : data.jobs.length === 0 ? (
              <EmptyState description="Nothing has failed." icon={CheckCircleIcon} title="All clear" />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Job</TableHeaderCell>
                    <TableHeaderCell>Error</TableHeaderCell>
                    <TableHeaderCell>Failed</TableHeaderCell>
                    <TableHeaderCell>{null}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.jobs.map((job) => (
                    <TableRow key={`${job.queue}/${job.id}`}>
                      <TableCell>
                        {job.name}
                        <span className="block text-xs text-muted">
                          {job.queue} · {job.id} · {job.attemptsMade} attempts
                        </span>
                      </TableCell>
                      <TableCell className="max-w-md break-words text-xs">{job.failedReason ?? "No reason given"}</TableCell>
                      <TableCell>{job.failedAt ? formatDateTime(job.failedAt) : "–"}</TableCell>
                      <TableCell>
                        <Button
                          isLoading={retryMutation.isPending && retryMutation.variables?.jobId === job.id}
                          onClick={() => retryMutation.mutate({ queue: job.queue, jobId: job.id })}
                          size="sm"
                          variant="secondary"
                        >
                          Retry
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>

          <SectionCard description="Consumers ignore events they already handled, so replaying is safe." title="Undelivered events">
            {data.outboxEvents.length === 0 ? (
              <EmptyState description="Every event was delivered." icon={CheckCircleIcon} title="All clear" />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Event</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell>{null}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.outboxEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        {event.type}
                        <span className="block text-xs text-muted">
                          {event.id} · {event.attempts} attempts
                        </span>
                      </TableCell>
                      <TableCell>{formatDateTime(event.createdAt)}</TableCell>
                      <TableCell>
                        <Button
                          isLoading={replayMutation.isPending && replayMutation.variables?.eventId === event.id}
                          onClick={() => replayMutation.mutate({ eventId: event.id })}
                          size="sm"
                          variant="secondary"
                        >
                          Replay
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>
      )}
    </PageContainer>
  );
}
