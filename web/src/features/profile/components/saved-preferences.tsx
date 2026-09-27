"use client";

import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { SparklesIcon, TrashIcon } from "@/components/ui/icons";
import { SectionCard } from "@/components/ui/section-card";
import { PREFERENCE_UI_CONSTANTS } from "@/features/customers/constants/preference-ui.constants";
import {
  getListMyPreferencesQueryKey,
  useDeleteMyPreference,
  useListMyPreferences,
} from "@/generated/api/customers/customers";
import type { CustomerPreferenceResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";

/**
 * What each business's booking assistant remembers about the user, with a
 * way to remove any of it.
 */
export function SavedPreferences() {
  const queryClient = useQueryClient();
  const preferencesQuery = useListMyPreferences();
  const deleteMutation = useDeleteMyPreference({
    mutation: {
      onSettled: () =>
        queryClient.invalidateQueries({ queryKey: getListMyPreferencesQueryKey() }),
    },
  });
  const items = preferencesQuery.data?.items ?? [];

  return (
    <SectionCard
      className="mt-5"
      description="The booking assistant uses these to suggest your usual service, provider and time. Removing one doesn't affect your bookings."
      title="What we remember"
    >
      {preferencesQuery.isPending ? (
        <div className="space-y-3" role="status">
          <span className="sr-only">Loading saved preferences</span>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      ) : preferencesQuery.isError ? (
        <Alert tone="danger">
          {getApiErrorMessage(preferencesQuery.error, "Saved preferences could not be loaded.")}
        </Alert>
      ) : items.length === 0 ? (
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-brand">
            <SparklesIcon className="size-[18px]" />
          </span>
          <p className="text-sm text-muted">
            Nothing yet. Tell the assistant something like “I always see Sana” and it will remember it for
            next time. Regular visits are remembered too.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {deleteMutation.isError ? (
            <Alert tone="danger">
              {getApiErrorMessage(deleteMutation.error, "That preference could not be removed. Please try again.")}
            </Alert>
          ) : null}
          {items.map((item) => (
            <div key={item.business.id}>
              <h4 className="text-sm font-semibold text-ink">{item.business.name}</h4>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {item.preferences.map((preference) => (
                  <PreferenceRow
                    isRemoving={
                      deleteMutation.isPending && deleteMutation.variables?.preferenceId === preference.id
                    }
                    key={preference.id}
                    onRemove={() => deleteMutation.mutate({ preferenceId: preference.id })}
                    preference={preference}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function PreferenceRow({
  isRemoving,
  onRemove,
  preference,
}: {
  isRemoving: boolean;
  onRemove: () => void;
  preference: CustomerPreferenceResponse;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">
          {PREFERENCE_UI_CONSTANTS.KEY_LABELS[preference.key]}
        </p>
        <p className="mt-0.5 text-sm font-medium text-ink">{preference.label}</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={preference.source === "CUSTOMER" ? "brand" : "neutral"}>
          {PREFERENCE_UI_CONSTANTS.SOURCE_LABELS[preference.source]}
        </Badge>
        <Button
          aria-label={`Forget ${PREFERENCE_UI_CONSTANTS.KEY_LABELS[preference.key].toLowerCase()}`}
          isLoading={isRemoving}
          leadingIcon={<TrashIcon className="size-4" />}
          onClick={onRemove}
          size="sm"
          variant="ghost"
        >
          Forget
        </Button>
      </div>
    </li>
  );
}
