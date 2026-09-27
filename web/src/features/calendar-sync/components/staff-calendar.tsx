"use client";

import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { CalendarIcon, RefreshIcon } from "@/components/ui/icons";
import { CALENDAR_UI_CONSTANTS } from "@/features/calendar-sync/constants/calendar-ui.constants";
import {
  getListCalendarConnectionsQueryKey,
  useDisconnectCalendar,
  useStartCalendarConnection,
  useSyncCalendar,
} from "@/generated/api/calendar-sync/calendar-sync";
import type {
  CalendarConnectionResponse,
  CalendarProvider,
  CalendarProvidersResponse,
} from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDateTime } from "@/lib/utils/date-time";

const { PROVIDER_LABELS } = CALENDAR_UI_CONSTANTS;

/**
 * A staff member's calendar: connected or not, when it last synced, and the
 * actions the viewer may take (owners, managers, or the person themselves).
 */
export function StaffCalendar({
  businessId,
  canManage,
  connection,
  providers,
  staffId,
}: {
  businessId: string;
  canManage: boolean;
  connection: CalendarConnectionResponse | undefined;
  providers: CalendarProvidersResponse | undefined;
  staffId: string;
}) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListCalendarConnectionsQueryKey(businessId) });
  const startMutation = useStartCalendarConnection({
    mutation: { onSuccess: (response) => window.location.assign(response.authorizationUrl) },
  });
  const disconnectMutation = useDisconnectCalendar({ mutation: { onSuccess: refresh } });
  const syncMutation = useSyncCalendar();
  const available = (["GOOGLE", "MICROSOFT"] as const).filter((provider) =>
    provider === "GOOGLE" ? providers?.google : providers?.microsoft,
  );
  const error = startMutation.error ?? disconnectMutation.error ?? syncMutation.error;
  const needsReconnect = connection?.status === "NEEDS_RECONNECT";

  function connect(provider: CalendarProvider) {
    startMutation.mutate({ businessId, staffId, data: { provider } });
  }

  if (!connection && (!canManage || available.length === 0)) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
      {connection ? (
        <div className="flex flex-wrap items-center gap-2">
          <CalendarIcon className="size-3.5 text-brand" />
          <span className="font-semibold text-ink">{PROVIDER_LABELS[connection.provider]}</span>
          <span className="truncate text-muted">{connection.accountEmail}</span>
          {needsReconnect ? (
            <Badge tone="warning">Reconnect needed</Badge>
          ) : connection.lastSyncedAt ? (
            <span className="text-muted">
              · Synced {formatDateTime(connection.lastSyncedAt)}
              {connection.liveUpdates ? "" : " (checked every 15 minutes)"}
            </span>
          ) : (
            <span className="text-muted">· First sync in progress</span>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-muted">
          <CalendarIcon className="size-3.5" />
          Connect a calendar so busy times block bookings and bookings show up there.
        </p>
      )}

      {connection?.lastError && !needsReconnect ? (
        <p className="text-danger">Last sync problem: {connection.lastError}</p>
      ) : null}
      {error ? <Alert tone="danger">{getApiErrorMessage(error, "The calendar could not be updated.")}</Alert> : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {!connection || needsReconnect
            ? available.map((provider) => (
                <Button
                  isLoading={startMutation.isPending && startMutation.variables?.data.provider === provider}
                  key={provider}
                  onClick={() => connect(provider)}
                  size="sm"
                  variant="secondary"
                >
                  {needsReconnect ? "Reconnect" : "Connect"} {PROVIDER_LABELS[provider]}
                </Button>
              ))
            : null}
          {connection && !needsReconnect ? (
            <Button
              isLoading={syncMutation.isPending}
              leadingIcon={<RefreshIcon className="size-4" />}
              onClick={() => syncMutation.mutate({ businessId, staffId }, { onSuccess: () => void refresh() })}
              size="sm"
              variant="ghost"
            >
              {syncMutation.isSuccess ? "Sync requested" : "Sync now"}
            </Button>
          ) : null}
          {connection ? (
            <Button
              isLoading={disconnectMutation.isPending}
              onClick={() => disconnectMutation.mutate({ businessId, staffId })}
              size="sm"
              variant="ghost"
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
