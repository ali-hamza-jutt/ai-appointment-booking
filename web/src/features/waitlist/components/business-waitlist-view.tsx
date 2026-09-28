"use client";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { ClockIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { describeWaitlistWindow } from "@/features/waitlist/utils/waitlist-format";
import type { BusinessSummaryResponse } from "@/generated/api/models";
import { useListBusinessWaitlist } from "@/generated/api/waitlist/waitlist";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDate, formatDateTime } from "@/lib/utils/date-time";

export function BusinessWaitlistView() {
  return (
    <BusinessRequired>
      {(business) => <BusinessWaitlistContent business={business} />}
    </BusinessRequired>
  );
}

function BusinessWaitlistContent({ business }: { business: BusinessSummaryResponse }) {
  const waitlistQuery = useListBusinessWaitlist(business.id);
  const entries = waitlistQuery.data?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        description="Customers waiting for a time, first come first served. When a booking is cancelled, its time is held for the first one it suits for 15 minutes."
        title="Waitlist"
      />

      {waitlistQuery.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : waitlistQuery.isError ? (
        <Alert tone="danger">{getApiErrorMessage(waitlistQuery.error, "The waitlist could not be loaded.")}</Alert>
      ) : entries.length === 0 ? (
        <EmptyState
          description="Customers can join from the booking chat when nothing fits their dates."
          icon={ClockIcon}
          title="Nobody is waiting"
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Customer</TableHeaderCell>
              <TableHeaderCell>Service</TableHeaderCell>
              <TableHeaderCell>When</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Joined</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-semibold text-ink">
                  {entry.customer.name}
                  <span className="block text-xs font-normal text-muted">
                    {[entry.customer.email, entry.customer.phone].filter(Boolean).join(" · ") || "No contact details"}
                  </span>
                </TableCell>
                <TableCell>
                  {entry.service.name}
                  {entry.staff ? <span className="block text-xs text-muted">with {entry.staff.name}</span> : null}
                </TableCell>
                <TableCell>{describeWaitlistWindow(entry)}</TableCell>
                <TableCell>
                  {entry.offer ? (
                    <>
                      <Badge tone="warning">Time held</Badge>
                      <span className="mt-1 block text-xs text-muted">
                        {formatDateTime(entry.offer.startsAt, entry.timeZone)}
                      </span>
                    </>
                  ) : (
                    <Badge tone="neutral">Waiting</Badge>
                  )}
                </TableCell>
                <TableCell>{formatDate(entry.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageContainer>
  );
}
