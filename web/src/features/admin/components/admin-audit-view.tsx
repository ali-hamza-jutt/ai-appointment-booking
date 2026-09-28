"use client";

import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { useListAdminAuditLog } from "@/generated/api/platform-admin/platform-admin";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDateTime } from "@/lib/utils/date-time";

const ACTION_LABELS: Record<string, string> = {
  "impersonation.start": "Signed in as",
  "impersonation.request": "Changed, as",
  "business.suspend": "Suspended business",
  "business.unsuspend": "Lifted suspension",
  "job.retry": "Retried job",
  "outbox.replay": "Replayed event",
};

function describe(details: Record<string, unknown> | null): string {
  if (!details) return "";

  return Object.entries(details)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

/** What platform admins did, newest first. */
export function AdminAuditView() {
  const logQuery = useListAdminAuditLog();

  return (
    <PageContainer size="wide">
      <PageHeader description="The latest 100 admin actions, including every change made while signed in as someone." title="Audit log" />
      {logQuery.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : logQuery.isError ? (
        <Alert tone="danger">{getApiErrorMessage(logQuery.error, "The audit log could not be loaded.")}</Alert>
      ) : logQuery.data.items.length === 0 ? (
        <p className="text-sm text-muted">No admin actions yet.</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>When</TableHeaderCell>
              <TableHeaderCell>Admin</TableHeaderCell>
              <TableHeaderCell>Action</TableHeaderCell>
              <TableHeaderCell>Details</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logQuery.data.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                <TableCell>{entry.admin.fullName}</TableCell>
                <TableCell>
                  {ACTION_LABELS[entry.action] ?? entry.action}
                  <span className="block text-xs text-muted">
                    {entry.targetType} {entry.targetId ?? ""}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{describe(entry.details ?? null)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageContainer>
  );
}
