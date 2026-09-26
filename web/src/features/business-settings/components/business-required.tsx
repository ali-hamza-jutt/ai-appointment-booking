"use client";

import type { ReactNode } from "react";

import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Spinner } from "@/components/ui/feedback";
import { BuildingIcon, PlusIcon, RefreshIcon } from "@/components/ui/icons";
import { PageContainer } from "@/components/ui/page-header";
import { useActiveBusiness } from "@/features/business-settings/context/active-business-context";
import type { BusinessSummaryResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";

interface BusinessRequiredProps {
  children: (business: BusinessSummaryResponse) => ReactNode;
}

/** Renders business pages only once the user has an active business. */
export function BusinessRequired({ children }: BusinessRequiredProps) {
  const { activeBusiness, error, isLoading, retry } = useActiveBusiness();

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error && !activeBusiness) {
    return (
      <PageContainer size="narrow">
        <Alert tone="danger">
          {getApiErrorMessage(error, "Your businesses could not be loaded.")}
        </Alert>
        <Button
          className="mt-4"
          leadingIcon={<RefreshIcon className="size-4" />}
          onClick={retry}
          variant="secondary"
        >
          Try again
        </Button>
      </PageContainer>
    );
  }

  if (!activeBusiness) {
    return (
      <PageContainer size="narrow">
        <EmptyState
          action={
            <LinkButton href="/business/setup" leadingIcon={<PlusIcon className="size-4" />}>
              Set up your business
            </LinkButton>
          }
          description="Create a business to manage services, staff, availability and bookings."
          icon={BuildingIcon}
          title="You don't have a business yet"
        />
      </PageContainer>
    );
  }

  return <>{children(activeBusiness)}</>;
}
