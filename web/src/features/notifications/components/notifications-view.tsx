"use client";

import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { RefreshIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { canManageBusiness } from "@/features/business-settings/utils/business-permissions";
import { MessageTemplatesPanel } from "@/features/notifications/components/message-templates-panel";
import { ReminderSettingsForm } from "@/features/notifications/components/reminder-settings-form";
import { useGetBusiness } from "@/generated/api/businesses/businesses";
import type { BusinessSummaryResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";

export function NotificationsView() {
  return (
    <BusinessRequired>
      {(business) => <NotificationsContent summary={business} />}
    </BusinessRequired>
  );
}

function NotificationsContent({ summary }: { summary: BusinessSummaryResponse }) {
  const businessQuery = useGetBusiness(summary.id);
  const business = businessQuery.data;
  const canEdit = canManageBusiness(summary.role);

  return (
    <PageContainer>
      <PageHeader
        description={
          canEdit
            ? "Choose when customers are reminded and what your booking emails and texts say."
            : "Only owners and managers can change notifications."
        }
        title="Notifications"
      />

      {businessQuery.isPending ? (
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : businessQuery.isError || !business ? (
        <div>
          <Alert tone="danger">
            {getApiErrorMessage(businessQuery.error, "Notification settings could not be loaded.")}
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
          <ReminderSettingsForm business={business} canEdit={canEdit} />
          <MessageTemplatesPanel businessId={business.id} canEdit={canEdit} />
        </div>
      )}
    </PageContainer>
  );
}
