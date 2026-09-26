"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { ClockIcon, EditIcon, FolderIcon, PlusIcon, TagIcon, UsersIcon } from "@/components/ui/icons";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { canManageBusiness } from "@/features/business-settings/utils/business-permissions";
import { CategoriesModal } from "@/features/catalog/components/categories-modal";
import { ServiceFormModal } from "@/features/catalog/components/service-form-modal";
import {
  formatDuration,
  groupServicesByCategory,
} from "@/features/catalog/utils/catalog-format";
import {
  useGetBusiness,
  useListBusinessVerticals,
  useListLocations,
} from "@/generated/api/businesses/businesses";
import {
  getListServicesQueryKey,
  useListServiceCategories,
  useListServices,
} from "@/generated/api/catalog/catalog";
import type {
  BusinessSummaryResponse,
  ServiceResponse,
} from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatMoney } from "@/lib/utils/money";

type EditorState =
  | { mode: "closed" }
  | { mode: "create"; initialName?: string }
  | { mode: "edit"; service: ServiceResponse };

export function ServicesView() {
  return (
    <BusinessRequired>
      {(business) => <ServicesContent business={business} />}
    </BusinessRequired>
  );
}

function ServicesContent({ business }: { business: BusinessSummaryResponse }) {
  const queryClient = useQueryClient();
  const businessQuery = useGetBusiness(business.id);
  const servicesQuery = useListServices(business.id);
  const categoriesQuery = useListServiceCategories(business.id);
  const locationsQuery = useListLocations(business.id);
  const verticalsQuery = useListBusinessVerticals();
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const canEdit = canManageBusiness(business.role);
  const services = servicesQuery.data?.items ?? [];
  const categories = categoriesQuery.data?.items ?? [];
  const currency = businessQuery.data?.currency;
  const suggestions =
    verticalsQuery.data?.items.find((vertical) => vertical.id === business.vertical)
      ?.suggestedServices ?? [];

  function handleSaved() {
    void queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(business.id) });
    setEditor({ mode: "closed" });
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          canEdit ? (
            <>
              <Button
                leadingIcon={<FolderIcon className="size-4" />}
                onClick={() => setIsCategoriesOpen(true)}
                variant="secondary"
              >
                Categories
              </Button>
              <Button
                disabled={!currency}
                leadingIcon={<PlusIcon className="size-4" />}
                onClick={() => setEditor({ mode: "create" })}
              >
                Add service
              </Button>
            </>
          ) : null
        }
        description="Everything customers can book, with prices, durations and seats."
        title="Services"
      />

      {servicesQuery.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : servicesQuery.isError ? (
        <Alert tone="danger">
          {getApiErrorMessage(servicesQuery.error, "Services could not be loaded.")}
        </Alert>
      ) : services.length === 0 ? (
        <EmptyState
          action={
            canEdit && suggestions.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <Button
                    disabled={!currency}
                    key={suggestion}
                    leadingIcon={<PlusIcon className="size-4" />}
                    onClick={() => setEditor({ mode: "create", initialName: suggestion })}
                    size="sm"
                    variant="secondary"
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            ) : null
          }
          description={
            canEdit
              ? "Add your first service, or start from a suggestion for your business type."
              : "An owner or manager can add services."
          }
          icon={TagIcon}
          title="No services yet"
        />
      ) : (
        <div className="space-y-6">
          {groupServicesByCategory(services, categories).map((group) => (
            <SectionCard key={group.id} title={group.name}>
              <ul className="divide-y divide-border">
                {group.services.map((service) => (
                  <ServiceRow
                    canEdit={canEdit}
                    key={service.id}
                    onEdit={() => setEditor({ mode: "edit", service })}
                    service={service}
                  />
                ))}
              </ul>
            </SectionCard>
          ))}
        </div>
      )}

      {editor.mode !== "closed" && currency ? (
        <ServiceFormModal
          businessId={business.id}
          categories={categories}
          currency={currency}
          locations={locationsQuery.data?.items ?? []}
          onClose={() => setEditor({ mode: "closed" })}
          onSaved={handleSaved}
          {...(editor.mode === "edit" ? { service: editor.service } : {})}
          {...(editor.mode === "create" && editor.initialName
            ? { initialName: editor.initialName }
            : {})}
        />
      ) : null}

      {isCategoriesOpen ? (
        <CategoriesModal
          businessId={business.id}
          categories={categories}
          onClose={() => setIsCategoriesOpen(false)}
        />
      ) : null}
    </PageContainer>
  );
}

function ServiceRow({
  canEdit,
  onEdit,
  service,
}: {
  canEdit: boolean;
  onEdit: () => void;
  service: ServiceResponse;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
        {service.bookingType === "CLASS" ? (
          <UsersIcon className="size-[18px]" />
        ) : (
          <TagIcon className="size-[18px]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">{service.name}</p>
          {service.bookingType === "CLASS" ? (
            <Badge tone="brand">Class · {service.capacity} seats</Badge>
          ) : null}
          {!service.isActive ? <Badge tone="neutral">Archived</Badge> : null}
          {service.isActive && !service.onlineBookable ? (
            <Badge tone="warning">Staff only</Badge>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="size-3.5" />
            {formatDuration(service.durationMinutes)}
          </span>
          {service.location ? <span>{service.location.name}</span> : null}
        </p>
      </div>
      <p className="text-sm font-semibold text-ink">
        {formatMoney(service.priceMinor, service.currency)}
      </p>
      {canEdit ? (
        <Button
          aria-label={`Edit ${service.name}`}
          onClick={onEdit}
          size="sm"
          variant="ghost"
        >
          <EditIcon className="size-4" />
        </Button>
      ) : null}
    </li>
  );
}
