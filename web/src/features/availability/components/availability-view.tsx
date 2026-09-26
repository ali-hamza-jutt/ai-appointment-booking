"use client";

import { useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { SelectField } from "@/components/ui/form-controls";
import { ClockIcon } from "@/components/ui/icons";
import { LinkButton } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { AvailabilityPreview } from "@/features/availability/components/availability-preview";
import { ClosuresPanel } from "@/features/availability/components/closures-panel";
import { TimeOffPanel } from "@/features/availability/components/time-off-panel";
import { WeeklyHoursEditor } from "@/features/availability/components/weekly-hours-editor";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { canManageBusiness } from "@/features/business-settings/utils/business-permissions";
import { useListWorkingHours } from "@/generated/api/availability/availability";
import { useGetBusiness } from "@/generated/api/businesses/businesses";
import { useListServices } from "@/generated/api/catalog/catalog";
import type {
  BusinessResponse,
  BusinessSummaryResponse,
  StaffResponse,
} from "@/generated/api/models";
import { useListStaff } from "@/generated/api/staff/staff";
import { getApiErrorMessage } from "@/lib/api/api-error";

export function AvailabilityView() {
  return (
    <BusinessRequired>
      {(business) => <AvailabilityContent summary={business} />}
    </BusinessRequired>
  );
}

function AvailabilityContent({ summary }: { summary: BusinessSummaryResponse }) {
  const businessQuery = useGetBusiness(summary.id);
  const staffQuery = useListStaff(summary.id);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const staff = staffQuery.data?.items ?? [];
  const selected = staff.find((member) => member.id === selectedStaffId) ?? staff[0];
  const canEdit = canManageBusiness(summary.role);

  return (
    <PageContainer>
      <PageHeader
        description="Set when each person works. Customers can only book open slots."
        title="Availability"
      />

      {staffQuery.isPending || businessQuery.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : staffQuery.isError || businessQuery.isError ? (
        <Alert tone="danger">
          {getApiErrorMessage(
            staffQuery.error ?? businessQuery.error,
            "Availability could not be loaded.",
          )}
        </Alert>
      ) : !selected ? (
        <EmptyState
          action={<LinkButton href="/business/staff">Add staff</LinkButton>}
          description="Add the people customers can book before setting their hours."
          icon={ClockIcon}
          title="No staff yet"
        />
      ) : (
        <div className="space-y-6">
          <div className="max-w-sm">
            <SelectField
              id="availability-staff"
              label="Staff member"
              onChange={(event) => setSelectedStaffId(event.target.value)}
              value={selected.id}
            >
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                  {member.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </SelectField>
          </div>
          <StaffSchedule
            business={businessQuery.data}
            canEdit={canEdit}
            key={selected.id}
            staff={selected}
          />
          <ClosuresPanel
            businessId={summary.id}
            canEdit={canEdit}
            timeZone={businessQuery.data.timeZone}
          />
        </div>
      )}
    </PageContainer>
  );
}

function StaffSchedule({
  business,
  canEdit,
  staff,
}: {
  business: BusinessResponse;
  canEdit: boolean;
  staff: StaffResponse;
}) {
  const hoursQuery = useListWorkingHours(business.id, staff.id);
  const servicesQuery = useListServices(business.id);
  const assignedServiceIds = new Set(staff.services.map((service) => service.serviceId));
  const assignedServices = (servicesQuery.data?.items ?? []).filter((service) =>
    assignedServiceIds.has(service.id),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        {hoursQuery.isPending ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : hoursQuery.isError ? (
          <Alert tone="danger">
            {getApiErrorMessage(hoursQuery.error, "Working hours could not be loaded.")}
          </Alert>
        ) : (
          <WeeklyHoursEditor
            businessId={business.id}
            businessSlug={business.slug}
            canEdit={canEdit}
            items={hoursQuery.data.items}
            staffId={staff.id}
            timeZone={business.timeZone}
          />
        )}
        <TimeOffPanel
          businessId={business.id}
          businessSlug={business.slug}
          canEdit={canEdit}
          staffId={staff.id}
          timeZone={business.timeZone}
        />
      </div>
      <AvailabilityPreview
        businessSlug={business.slug}
        services={assignedServices}
        staffId={staff.id}
        timeZone={business.timeZone}
      />
    </div>
  );
}
