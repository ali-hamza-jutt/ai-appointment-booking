"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import type { BusinessSummaryResponse } from "@/generated/api/models";
import {
  getGetPaymentAccountQueryKey,
  useGetPaymentAccount,
  useOpenPaymentDashboard,
  useRefreshPaymentAccount,
  useStartPaymentOnboarding,
} from "@/generated/api/payments/payments";
import { getApiErrorMessage } from "@/lib/api/api-error";

export function PaymentSettingsView() {
  return (
    <BusinessRequired>
      {(business) => (
        <Suspense fallback={null}>
          <PaymentSettingsContent business={business} />
        </Suspense>
      )}
    </BusinessRequired>
  );
}

function PaymentSettingsContent({ business }: { business: BusinessSummaryResponse }) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const returnedFromStripe = searchParams.get("stripe") === "return";
  const accountQuery = useGetPaymentAccount(business.id);
  const setAccount = (data: unknown) => queryClient.setQueryData(getGetPaymentAccountQueryKey(business.id), data);
  const onboardingMutation = useStartPaymentOnboarding({
    mutation: { onSuccess: (link) => window.location.assign(link.url) },
  });
  const dashboardMutation = useOpenPaymentDashboard({
    mutation: { onSuccess: (link) => window.open(link.url, "_blank", "noopener") },
  });
  const refreshMutation = useRefreshPaymentAccount({ mutation: { onSuccess: setAccount } });
  const refreshedOnReturn = useRef(false);
  const isOwner = business.role === "OWNER";
  const account = accountQuery.data;
  const error = onboardingMutation.error ?? dashboardMutation.error ?? refreshMutation.error;

  // Coming back from Stripe, read the new status rather than wait for the webhook.
  useEffect(() => {
    if (returnedFromStripe && account?.connected && !refreshedOnReturn.current) {
      refreshedOnReturn.current = true;
      refreshMutation.mutate({ businessId: business.id });
    }
  }, [account?.connected, business.id, refreshMutation, returnedFromStripe]);

  return (
    <PageContainer>
      <PageHeader
        description="Take deposits or full payment when customers book. Money goes straight to your own Stripe account."
        title="Payments"
      />

      {accountQuery.isPending ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : accountQuery.isError || !account ? (
        <Alert tone="danger">{getApiErrorMessage(accountQuery.error, "Payment settings could not be loaded.")}</Alert>
      ) : !account.available ? (
        <Alert tone="info">Online payments are not set up on this BookWise deployment yet.</Alert>
      ) : (
        <SectionCard
          actions={
            account.chargesEnabled ? (
              <Badge tone="success">Taking payments</Badge>
            ) : account.connected ? (
              <Badge tone="warning">Setup not finished</Badge>
            ) : (
              <Badge tone="neutral">Not connected</Badge>
            )
          }
          description={
            account.chargesEnabled
              ? "Services set to take a deposit or full price now ask customers to pay when they book."
              : "Connect a Stripe account to take deposits. Until then, customers pay at the appointment."
          }
          title="Stripe account"
        >
          <div className="space-y-4">
            {error ? <Alert tone="danger">{getApiErrorMessage(error, "Stripe could not be reached.")}</Alert> : null}
            {account.connected && !account.chargesEnabled ? (
              <p className="text-sm text-muted">
                Stripe still needs some details before it can take payments for you.
                {account.detailsSubmitted ? " Your details are being reviewed." : ""}
              </p>
            ) : null}
            {isOwner ? (
              <div className="flex flex-wrap gap-2">
                {!account.chargesEnabled ? (
                  <Button
                    isLoading={onboardingMutation.isPending}
                    onClick={() => onboardingMutation.mutate({ businessId: business.id })}
                  >
                    {account.connected ? "Continue Stripe setup" : "Connect Stripe"}
                  </Button>
                ) : null}
                {account.connected ? (
                  <Button
                    isLoading={dashboardMutation.isPending}
                    onClick={() => dashboardMutation.mutate({ businessId: business.id })}
                    variant="secondary"
                  >
                    Open Stripe dashboard
                  </Button>
                ) : null}
                {account.connected ? (
                  <Button
                    isLoading={refreshMutation.isPending}
                    onClick={() => refreshMutation.mutate({ businessId: business.id })}
                    variant="ghost"
                  >
                    Check status
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted">Only the business owner can connect or manage the Stripe account.</p>
            )}
          </div>
        </SectionCard>
      )}
    </PageContainer>
  );
}
