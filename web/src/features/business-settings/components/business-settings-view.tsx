"use client";

import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { RefreshIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { BookingPoliciesForm } from "@/features/business-settings/components/booking-policies-form";
import { BusinessProfileForm } from "@/features/business-settings/components/business-profile-form";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { LocationsPanel } from "@/features/business-settings/components/locations-panel";
import { MessagingPanel } from "@/features/business-settings/components/messaging-panel";
import { WidgetPanel } from "@/features/business-settings/components/widget-panel";
import { canManageBusiness } from "@/features/business-settings/utils/business-permissions";
import { useGetBusiness } from "@/generated/api/businesses/businesses";
import type { BusinessSummaryResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";

export function BusinessSettingsView() {
  return (
    <BusinessRequired>
      {(business) => <BusinessSettingsContent summary={business} />}
    </BusinessRequired>
  );
}

function BusinessSettingsContent({ summary }: { summary: BusinessSummaryResponse }) {
  const businessQuery = useGetBusiness(summary.id);
  const business = businessQuery.data;
  const canEdit = canManageBusiness(summary.role);

  return (
    <PageContainer>
      <PageHeader
        description={
          canEdit
            ? "Manage your business profile, booking rules and locations."
            : "Only owners and managers can change these settings."
        }
        title={summary.name}
      />

      {businessQuery.isPending ? (
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : businessQuery.isError || !business ? (
        <div>
          <Alert tone="danger">
            {getApiErrorMessage(businessQuery.error, "Business settings could not be loaded.")}
          </Alert>
          <Button
            className="mt-4"
            leadingIcon={<RefreshIcon className="size-4" />}
            onClick={() => void businessQuery.refetch()}
            variant="secondary"
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-6" key={business.id}>
          <BusinessProfileForm business={business} canEdit={canEdit} />
          <BookingPoliciesForm business={business} canEdit={canEdit} />
          <LocationsPanel business={business} canEdit={canEdit} />
          <WidgetPanel business={business} canEdit={canEdit} />
          <MessagingPanel business={business} canEdit={canEdit} />
        </div>
      )}
    </PageContainer>
  );
}
