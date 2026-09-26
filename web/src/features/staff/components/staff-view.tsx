"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { BuildingIcon, EditIcon, MapPinIcon, PlusIcon, UsersIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Tabs } from "@/components/ui/tabs";
import { getUserInitials } from "@/features/auth/utils/user-display";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { canManageBusiness } from "@/features/business-settings/utils/business-permissions";
import { ResourceFormModal } from "@/features/staff/components/resource-form-modal";
import { StaffFormModal } from "@/features/staff/components/staff-form-modal";
import { getProviderLabels, type ProviderLabels } from "@/features/staff/utils/staff-labels";
import {
  useListBusinessVerticals,
  useListLocations,
} from "@/generated/api/businesses/businesses";
import { useListServices } from "@/generated/api/catalog/catalog";
import type {
  BusinessSummaryResponse,
  ResourceResponse,
  StaffResponse,
} from "@/generated/api/models";
import {
  getListResourcesQueryKey,
  getListStaffQueryKey,
  useListResources,
  useListStaff,
} from "@/generated/api/staff/staff";
import { useListMembers } from "@/generated/api/team/team";
import { getApiErrorMessage } from "@/lib/api/api-error";

type StaffTab = "staff" | "resources";

type EditorState<T> = { mode: "closed" } | { mode: "create" } | { mode: "edit"; item: T };

export function StaffView() {
  return (
    <BusinessRequired>
      {(business) => <StaffContent business={business} />}
    </BusinessRequired>
  );
}

function StaffContent({ business }: { business: BusinessSummaryResponse }) {
  const queryClient = useQueryClient();
  const verticalsQuery = useListBusinessVerticals();
  const staffQuery = useListStaff(business.id);
  const resourcesQuery = useListResources(business.id);
  const servicesQuery = useListServices(business.id);
  const locationsQuery = useListLocations(business.id);
  const membersQuery = useListMembers(business.id);
  const [tab, setTab] = useState<StaffTab>("staff");
  const [staffEditor, setStaffEditor] = useState<EditorState<StaffResponse>>({ mode: "closed" });
  const [resourceEditor, setResourceEditor] = useState<EditorState<ResourceResponse>>({
    mode: "closed",
  });
  const canEdit = canManageBusiness(business.role);
  const labels = getProviderLabels(
    verticalsQuery.data?.items.find((vertical) => vertical.id === business.vertical)
      ?.providerLabel,
  );
  const staff = staffQuery.data?.items ?? [];
  const resources = resourcesQuery.data?.items ?? [];
  const services = (servicesQuery.data?.items ?? []).filter((service) => service.isActive);
  const locations = locationsQuery.data?.items ?? [];

  function closeStaffEditor() {
    void queryClient.invalidateQueries({ queryKey: getListStaffQueryKey(business.id) });
    setStaffEditor({ mode: "closed" });
  }

  function closeResourceEditor() {
    void queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey(business.id) });
    setResourceEditor({ mode: "closed" });
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <Button
              disabled={tab === "resources" && locations.length === 0}
              leadingIcon={<PlusIcon className="size-4" />}
              onClick={() =>
                tab === "staff"
                  ? setStaffEditor({ mode: "create" })
                  : setResourceEditor({ mode: "create" })
              }
            >
              {tab === "staff" ? `Add ${labels.singular.toLowerCase()}` : "Add resource"}
            </Button>
          ) : null
        }
        description="Who takes bookings, what they offer, and the rooms or equipment services need."
        title={labels.plural}
      />

      <Tabs
        ariaLabel="Staff sections"
        controls="staff-panel"
        onChange={setTab}
        options={[
          { label: labels.plural, value: "staff" },
          { label: "Resources", value: "resources" },
        ]}
        value={tab}
      />

      <section id="staff-panel" role="tabpanel">
        {tab === "staff" ? (
          <StaffPanel
            error={staffQuery.error}
            isPending={staffQuery.isPending}
            labels={labels}
            onEdit={canEdit ? (item) => setStaffEditor({ mode: "edit", item }) : undefined}
            staff={staff}
          />
        ) : (
          <ResourcesPanel
            error={resourcesQuery.error}
            isPending={resourcesQuery.isPending}
            onEdit={canEdit ? (item) => setResourceEditor({ mode: "edit", item }) : undefined}
            resources={resources}
          />
        )}
      </section>

      {staffEditor.mode !== "closed" ? (
        <StaffFormModal
          businessId={business.id}
          labels={labels}
          linkedUserIds={staff.flatMap((member) => (member.userId ? [member.userId] : []))}
          locations={locations}
          members={membersQuery.data?.members ?? []}
          onClose={() => setStaffEditor({ mode: "closed" })}
          onSaved={closeStaffEditor}
          services={services}
          {...(staffEditor.mode === "edit" ? { staff: staffEditor.item } : {})}
        />
      ) : null}

      {resourceEditor.mode !== "closed" ? (
        <ResourceFormModal
          businessId={business.id}
          locations={locations}
          onClose={() => setResourceEditor({ mode: "closed" })}
          onSaved={closeResourceEditor}
          services={services}
          {...(resourceEditor.mode === "edit" ? { resource: resourceEditor.item } : {})}
        />
      ) : null}
    </PageContainer>
  );
}

function StaffPanel({
  error,
  isPending,
  labels,
  onEdit,
  staff,
}: {
  error: Error | null;
  isPending: boolean;
  labels: ProviderLabels;
  onEdit: ((staff: StaffResponse) => void) | undefined;
  staff: StaffResponse[];
}) {
  if (isPending) return <Skeleton className="h-48 rounded-xl" />;

  if (error) {
    return <Alert tone="danger">{getApiErrorMessage(error, "Staff could not be loaded.")}</Alert>;
  }

  if (staff.length === 0) {
    return (
      <EmptyState
        description={`Add the ${labels.plural.toLowerCase()} customers can book, and choose the services each one offers.`}
        icon={UsersIcon}
        title={`No ${labels.plural.toLowerCase()} yet`}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {staff.map((member) => (
        <article
          className="rounded-xl border border-border bg-surface p-5 shadow-card"
          key={member.id}
        >
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">
              {getUserInitials(member.displayName) || "BW"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-ink">{member.displayName}</h3>
                {!member.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                {member.userId ? <Badge tone="brand">Has login</Badge> : null}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {member.email ?? "No email"}
              </p>
            </div>
            {onEdit ? (
              <Button
                aria-label={`Edit ${member.displayName}`}
                onClick={() => onEdit(member)}
                size="sm"
                variant="ghost"
              >
                <EditIcon className="size-4" />
              </Button>
            ) : null}
          </div>
          {member.bio ? <p className="mt-3 text-sm text-ink-soft">{member.bio}</p> : null}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {member.services.length === 0 ? (
              <span className="text-xs text-subtle">No services assigned</span>
            ) : (
              member.services.map((service) => (
                <Badge key={service.serviceId} tone="neutral">
                  {service.serviceName}
                </Badge>
              ))
            )}
          </div>
          <p className="mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted">
            <MapPinIcon className="size-3.5" />
            {member.locations.length === 0
              ? "All locations"
              : member.locations.map((location) => location.name).join(", ")}
          </p>
        </article>
      ))}
    </div>
  );
}

function ResourcesPanel({
  error,
  isPending,
  onEdit,
  resources,
}: {
  error: Error | null;
  isPending: boolean;
  onEdit: ((resource: ResourceResponse) => void) | undefined;
  resources: ResourceResponse[];
}) {
  if (isPending) return <Skeleton className="h-40 rounded-xl" />;

  if (error) {
    return (
      <Alert tone="danger">{getApiErrorMessage(error, "Resources could not be loaded.")}</Alert>
    );
  }

  if (resources.length === 0) {
    return (
      <EmptyState
        description="Add treatment rooms, chairs or machines when two services cannot use the same one at once."
        icon={BuildingIcon}
        title="No resources"
      />
    );
  }

  return (
    <SectionCard title="Resources">
      <ul className="divide-y divide-border">
        {resources.map((resource) => (
          <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0" key={resource.id}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">{resource.name}</p>
                {resource.capacity > 1 ? (
                  <Badge tone="brand">{resource.capacity} at once</Badge>
                ) : null}
                {!resource.isActive ? <Badge tone="neutral">Unavailable</Badge> : null}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {resource.location.name}
                {resource.services.length > 0
                  ? ` · ${resource.services.map((service) => service.name).join(", ")}`
                  : " · Not required by any service"}
              </p>
            </div>
            {onEdit ? (
              <Button
                aria-label={`Edit ${resource.name}`}
                onClick={() => onEdit(resource)}
                size="sm"
                variant="ghost"
              >
                <EditIcon className="size-4" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
