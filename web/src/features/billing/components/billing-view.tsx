"use client";

import { useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { isBusinessOwner } from "@/features/business-settings/utils/business-permissions";
import { useGetBilling, useOpenBillingPortal, useStartCheckout } from "@/generated/api/billing/billing";
import type { BillingResponse, BusinessSummaryResponse, PlanResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date-time";

/** How often the page checks for Stripe's confirmation after Checkout. */
const CONFIRMATION_POLL_MS = 3_000;

const USAGE_ROWS: ReadonlyArray<{ key: keyof PlanResponse["limits"]; label: string }> = [
  { key: "staffSeats", label: "Providers" },
  { key: "aiConversations", label: "Assistant chats this month" },
  { key: "textMessages", label: "Text messages this month" },
];

export function BillingView() {
  return <BusinessRequired>{(business) => <BillingContent business={business} />}</BusinessRequired>;
}

function BillingContent({ business }: { business: BusinessSummaryResponse }) {
  const searchParams = useSearchParams();
  const justPaid = searchParams.get("checkout") === "done";
  const billingQuery = useGetBilling(business.id, {
    // Stripe's webhook lands a moment after Checkout returns; keep checking until the plan shows.
    query: { refetchInterval: (query) => (justPaid && query.state.data?.source === "free" ? CONFIRMATION_POLL_MS : false) },
  });
  const redirect = { onSuccess: (response: { url: string }) => window.location.assign(response.url) };
  const checkoutMutation = useStartCheckout({ mutation: redirect });
  const portalMutation = useOpenBillingPortal({ mutation: redirect });
  const isOwner = isBusinessOwner(business.role);
  const data = billingQuery.data;

  return (
    <PageContainer>
      <PageHeader description="Your BookWise plan and what it includes. Payments are handled by Stripe." title="Plan and billing" />
      {checkoutMutation.error || portalMutation.error ? (
        <Alert className="mb-4" tone="danger">
          {getApiErrorMessage(checkoutMutation.error ?? portalMutation.error, "Stripe couldn't be reached. Please try again.")}
        </Alert>
      ) : null}
      {justPaid && data?.source === "free" ? (
        <Alert className="mb-4" tone="info">
          Thanks! Stripe is confirming your subscription; this page updates in a moment.
        </Alert>
      ) : null}
      {billingQuery.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : billingQuery.isError || !data ? (
        <Alert tone="danger">{getApiErrorMessage(billingQuery.error, "Billing could not be loaded.")}</Alert>
      ) : !data.enabled ? (
        <Alert tone="info">Plans aren&apos;t switched on for this BookWise server, so nothing is limited.</Alert>
      ) : (
        <div className="space-y-6">
          <CurrentPlan
            data={data}
            isOwner={isOwner}
            isOpeningPortal={portalMutation.isPending}
            onManage={() => portalMutation.mutate({ businessId: business.id })}
          />
          <SectionCard
            description={isOwner ? "Upgrading takes you to Stripe to pay. You can change or cancel any time." : "Only the business owner can change the plan."}
            title="Plans"
          >
            <div className="grid gap-4 md:grid-cols-3">
              {data.plans.map((plan) => {
                const isCurrent = plan.id === data.plan.id;

                return (
                  <div
                    className={cn("flex flex-col rounded-xl border p-4", isCurrent ? "border-brand bg-brand-soft/40" : "border-border")}
                    key={plan.id}
                  >
                    <p className="text-sm font-semibold text-ink">{plan.name}</p>
                    <p className="mt-1 text-2xl font-bold text-ink">
                      ${plan.priceMonthlyUsd}
                      <span className="text-sm font-normal text-muted"> / month</span>
                    </p>
                    <ul className="mt-3 flex-1 space-y-1 text-sm text-ink-soft">
                      <li>{plan.limits.staffSeats} {plan.limits.staffSeats === 1 ? "provider" : "providers"}</li>
                      <li>{plan.limits.aiConversations.toLocaleString()} assistant chats a month</li>
                      <li>{plan.limits.textMessages.toLocaleString()} text messages a month</li>
                    </ul>
                    {isCurrent ? (
                      <Badge className="mt-4 self-start" tone="brand">Current plan</Badge>
                    ) : isOwner && plan.id !== "FREE" && data.source !== "stripe" ? (
                      <Button
                        className="mt-4"
                        isLoading={checkoutMutation.isPending && checkoutMutation.variables?.data.plan === plan.id}
                        onClick={() => checkoutMutation.mutate({ businessId: business.id, data: { plan: plan.id as "STARTER" | "PRO" } })}
                        size="sm"
                      >
                        Choose {plan.name}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}
    </PageContainer>
  );
}

function CurrentPlan({
  data,
  isOpeningPortal,
  isOwner,
  onManage,
}: {
  data: BillingResponse;
  isOpeningPortal: boolean;
  isOwner: boolean;
  onManage: () => void;
}) {
  return (
    <SectionCard
      actions={
        isOwner && data.canManageInPortal ? (
          <Button isLoading={isOpeningPortal} onClick={onManage} size="sm" variant="secondary">
            Manage billing
          </Button>
        ) : null
      }
      description={
        data.source === "complimentary"
          ? "Provided by BookWise at no charge."
          : data.status === "past_due"
            ? "Your last payment failed. Update your card in Manage billing to keep your plan."
            : data.cancelAtPeriodEnd && data.currentPeriodEnd
              ? `Cancelled; you move to Free on ${formatDate(data.currentPeriodEnd)}.`
              : data.currentPeriodEnd
                ? `Renews on ${formatDate(data.currentPeriodEnd)}.`
                : "Upgrade for more providers, chats and text messages."
      }
      title={`${data.plan.name} plan`}
    >
      <ul className="space-y-3">
        {USAGE_ROWS.map((row) => {
          const used = data.usage[row.key];
          const limit = data.plan.limits[row.key];
          const share = limit > 0 ? Math.min(1, used / limit) : 1;

          return (
            <li key={row.key}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">{row.label}</span>
                <span className={cn("text-muted", used >= limit && "font-semibold text-danger")}>
                  {used.toLocaleString()} of {limit.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className={cn("h-full rounded-full", used >= limit ? "bg-danger" : "bg-brand")}
                  style={{ width: `${Math.round(share * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
