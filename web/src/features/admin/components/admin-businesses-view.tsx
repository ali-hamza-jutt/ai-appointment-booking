"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { BuildingIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { useListAdminBusinesses } from "@/generated/api/platform-admin/platform-admin";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDate } from "@/lib/utils/date-time";

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 4 : 2 }).format(value);
}

/** Every tenant, newest first, searchable by name or booking link. */
export function AdminBusinessesView() {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 300);
  const businessesQuery = useListAdminBusinesses(debounced ? { search: debounced } : {});
  const businesses = businessesQuery.data?.items ?? [];

  return (
    <PageContainer size="wide">
      <PageHeader description="All businesses on BookWise, newest first. Spend is estimated from model list prices." title="Businesses" />
      <div className="mb-4 max-w-sm">
        <TextField
          hideLabel
          id="admin-business-search"
          label="Search businesses"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or booking link"
          value={search}
        />
      </div>
      {businessesQuery.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : businessesQuery.isError ? (
        <Alert tone="danger">{getApiErrorMessage(businessesQuery.error, "Businesses could not be loaded.")}</Alert>
      ) : businesses.length === 0 ? (
        <EmptyState description="Try another search." icon={BuildingIcon} title="No businesses" />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Business</TableHeaderCell>
              <TableHeaderCell>Owner</TableHeaderCell>
              <TableHeaderCell>Team</TableHeaderCell>
              <TableHeaderCell>Bookings (30 days)</TableHeaderCell>
              <TableHeaderCell>Model spend (30 days)</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {businesses.map((business) => (
              <TableRow key={business.id}>
                <TableCell>
                  <Link className="font-semibold text-ink hover:text-brand" href={`/admin/businesses/${business.id}`}>
                    {business.name}
                  </Link>
                  <span className="block text-xs text-muted">
                    /{business.slug} · since {formatDate(business.createdAt)}
                  </span>
                </TableCell>
                <TableCell>
                  {business.owner ? (
                    <>
                      {business.owner.fullName}
                      <span className="block text-xs text-muted">{business.owner.email}</span>
                    </>
                  ) : (
                    <span className="text-subtle">None</span>
                  )}
                </TableCell>
                <TableCell>{business.memberCount}</TableCell>
                <TableCell>{business.bookingsLast30Days}</TableCell>
                <TableCell>{formatUsd(business.llmCostLast30DaysUsd)}</TableCell>
                <TableCell>
                  {business.suspension ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageContainer>
  );
}
