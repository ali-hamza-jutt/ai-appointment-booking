"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { TextAreaField } from "@/components/ui/form-controls";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatUsd } from "@/features/admin/components/admin-businesses-view";
import { useImpersonation } from "@/features/admin/hooks/use-impersonation";
import type { AdminBusinessDetail } from "@/generated/api/models";
import {
  getGetAdminBusinessQueryKey,
  useGetAdminBusiness,
  useGrantBusinessPlan,
  useSuspendBusiness,
  useUnsuspendBusiness,
} from "@/generated/api/platform-admin/platform-admin";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDateTime } from "@/lib/utils/date-time";

const PLAN_NAMES = { FREE: "Free", STARTER: "Starter", PRO: "Pro" } as const;

export function AdminBusinessDetailView({ businessId }: { businessId: string }) {
  const businessQuery = useGetAdminBusiness(businessId, { query: { retry: false } });

  return (
    <PageContainer size="wide">
      <Link className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink" href="/admin">
        <ArrowLeftIcon className="size-4" />
        All businesses
      </Link>
      {businessQuery.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : businessQuery.isError ? (
        <Alert tone="danger">{getApiErrorMessage(businessQuery.error, "This business could not be loaded.")}</Alert>
      ) : (
        <BusinessDetail business={businessQuery.data} />
      )}
    </PageContainer>
  );
}

function BusinessDetail({ business }: { business: AdminBusinessDetail }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const onUpdated = (updated: AdminBusinessDetail) => {
    queryClient.setQueryData(getGetAdminBusinessQueryKey(business.id), updated);
    setReason("");
  };
  const suspendMutation = useSuspendBusiness({ mutation: { onSuccess: onUpdated } });
  const unsuspendMutation = useUnsuspendBusiness({ mutation: { onSuccess: onUpdated } });
  const impersonation = useImpersonation();
  const planMutation = useGrantBusinessPlan({ mutation: { onSuccess: onUpdated } });

  function suspend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    suspendMutation.mutate({ businessId: business.id, data: { reason: reason.trim() } });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={business.suspension ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}
        description={`/${business.slug} · ${business.bookingsLast30Days} bookings and ${formatUsd(business.llmCostLast30DaysUsd)} of model spend in the last 30 days`}
        title={business.name}
      />

      <SectionCard
        description="A suspended business takes no bookings or chats and disappears from its public page and widget. Its team can still sign in and look."
        title="Suspension"
      >
        {business.suspension ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              Suspended {formatDateTime(business.suspension.at)}: {business.suspension.reason}
            </p>
            <Button
              isLoading={unsuspendMutation.isPending}
              onClick={() => unsuspendMutation.mutate({ businessId: business.id })}
              variant="secondary"
            >
              Lift suspension
            </Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={suspend}>
            <TextAreaField
              hint="The business's team sees this."
              id="suspend-reason"
              label="Reason"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              value={reason}
            />
            <Button disabled={reason.trim().length < 3} isLoading={suspendMutation.isPending} type="submit" variant="danger">
              Suspend business
            </Button>
          </form>
        )}
        {suspendMutation.error || unsuspendMutation.error ? (
          <Alert className="mt-3" tone="danger">
            {getApiErrorMessage(suspendMutation.error ?? unsuspendMutation.error, "That didn't work.")}
          </Alert>
        ) : null}
      </SectionCard>

      <SectionCard
        description={
          business.plan.source === "stripe"
            ? "This business pays for its plan through Stripe; its owner changes it there."
            : "Give the business a plan at no charge, or put it back on Free."
        }
        title={`Plan: ${PLAN_NAMES[business.plan.id]}${business.plan.source === "complimentary" ? " (complimentary)" : ""}`}
      >
        {business.plan.source === "stripe" ? (
          <p className="text-sm text-muted">Stripe status: {business.plan.status}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(["FREE", "STARTER", "PRO"] as const).map((plan) => (
              <Button
                disabled={plan === business.plan.id}
                isLoading={planMutation.isPending && planMutation.variables?.data.plan === plan}
                key={plan}
                onClick={() => planMutation.mutate({ businessId: business.id, data: { plan } })}
                size="sm"
                variant={plan === business.plan.id ? "primary" : "secondary"}
              >
                {PLAN_NAMES[plan]}
              </Button>
            ))}
          </div>
        )}
        {planMutation.error ? (
          <Alert className="mt-3" tone="danger">
            {getApiErrorMessage(planMutation.error, "The plan couldn't be changed.")}
          </Alert>
        ) : null}
      </SectionCard>

      <SectionCard description="Signing in as someone lasts 15 minutes and is recorded, with every change you make." title="Team">
        {impersonation.error ? (
          <Alert className="mb-3" tone="danger">
            {getApiErrorMessage(impersonation.error, "You can't sign in as this person.")}
          </Alert>
        ) : null}
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell>{null}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {business.team.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>
                  {member.fullName}
                  <span className="block text-xs text-muted">{member.email}</span>
                </TableCell>
                <TableCell>{member.role}</TableCell>
                <TableCell>
                  <Button
                    isLoading={impersonation.isPending && impersonation.variables?.userId === member.userId}
                    onClick={() => impersonation.mutate({ userId: member.userId })}
                    size="sm"
                    variant="secondary"
                  >
                    Sign in as
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard description="Chat model calls in the last 30 days, estimated from list prices." title="Model spend">
        {business.llmUsage.length === 0 ? (
          <p className="text-sm text-muted">No model calls in the last 30 days.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Day (UTC)</TableHeaderCell>
                  <TableHeaderCell>Calls</TableHeaderCell>
                  <TableHeaderCell>Tokens in / out</TableHeaderCell>
                  <TableHeaderCell>Cost</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...business.llmUsage].reverse().map((day) => (
                  <TableRow key={day.date}>
                    <TableCell>{day.date}</TableCell>
                    <TableCell>{day.requests}</TableCell>
                    <TableCell>
                      {day.inputTokens.toLocaleString()} / {day.outputTokens.toLocaleString()}
                    </TableCell>
                    <TableCell>{formatUsd(day.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Model</TableHeaderCell>
                  <TableHeaderCell>Calls</TableHeaderCell>
                  <TableHeaderCell>Cost</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {business.llmUsageByModel.map((model) => (
                  <TableRow key={model.model}>
                    <TableCell>{model.model}</TableCell>
                    <TableCell>{model.requests}</TableCell>
                    <TableCell>{formatUsd(model.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
