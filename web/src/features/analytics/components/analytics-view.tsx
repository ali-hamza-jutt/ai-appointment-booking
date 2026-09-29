"use client";

import { Alert, Skeleton } from "@/components/ui/feedback";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Tabs } from "@/components/ui/tabs";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { canManageBusiness } from "@/features/business-settings/utils/business-permissions";
import { useGetAnalytics, useGetBusiness } from "@/generated/api/businesses/businesses";
import type { AnalyticsResponse, BusinessSummaryResponse } from "@/generated/api/models";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { cn } from "@/lib/utils/cn";
import { addDaysToDate, formatLocalDateLabel, getCurrentLocalDate } from "@/lib/utils/date-time";
import { formatMoney } from "@/lib/utils/money";

type RangeDays = "7" | "30" | "90";

const RANGES = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
] as const;

const RANGE_VALUES = RANGES.map((option) => option.value);

function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}

function hours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10} h`;
}

export function AnalyticsView() {
  return (
    <BusinessRequired>
      {(business) =>
        canManageBusiness(business.role) ? (
          <AnalyticsContent business={business} />
        ) : (
          <PageContainer>
            <Alert tone="info">Only owners and managers can see analytics.</Alert>
          </PageContainer>
        )
      }
    </BusinessRequired>
  );
}

function AnalyticsContent({ business }: { business: BusinessSummaryResponse }) {
  const [range, setRange] = useSearchParamState<RangeDays>("range", "30", RANGE_VALUES);
  const businessQuery = useGetBusiness(business.id);
  const timeZone = businessQuery.data?.timeZone;
  // The range ends today in the business's own time zone.
  const today = timeZone ? getCurrentLocalDate(timeZone) : "";
  const analyticsQuery = useGetAnalytics(
    business.id,
    { from: addDaysToDate(today || "2000-01-01", -(Number(range) - 1)), to: today },
    { query: { enabled: Boolean(today), staleTime: 60_000 } },
  );
  const shown = analyticsQuery.data;
  const isPending = businessQuery.isPending || analyticsQuery.isPending;
  const error = businessQuery.error ?? analyticsQuery.error;

  return (
    <PageContainer size="wide">
      <PageHeader
        description="How bookings and the assistant are doing. Past days are updated each night; today is live."
        title="Analytics"
      />
      <Tabs ariaLabel="Date range" controls="analytics-panel" onChange={setRange} options={RANGES} value={range} />
      <div className="space-y-6" id="analytics-panel" role="tabpanel">
        {error ? (
          <Alert tone="danger">{getApiErrorMessage(error, "Analytics could not be loaded.")}</Alert>
        ) : isPending || !shown ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : (
          <AnalyticsBody data={shown} />
        )}
      </div>
    </PageContainer>
  );
}

function AnalyticsBody({ data }: { data: AnalyticsResponse }) {
  const { assistant, totals } = data;
  const busiest = data.busiestHours.filter((hour) => hour.visits > 0);
  const firstHour = busiest[0]?.hour ?? 8;
  const lastHour = busiest.at(-1)?.hour ?? 18;
  const hourSpan = data.busiestHours.filter((hour) => hour.hour >= Math.min(firstHour, 8) && hour.hour <= Math.max(lastHour, 18));
  const stopped = assistant.dropOff.beforeChoosingService + assistant.dropOff.afterChoosingService + assistant.dropOff.atHeldTime;

  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="New bookings" value={String(totals.bookingsMade)} />
        <Tile label="Visits" value={String(totals.visits)} />
        <Tile label="Revenue (completed)" value={formatMoney(totals.revenueMinor, data.currency)} />
        <Tile label="Cancellation rate" value={percent(totals.cancellationRate)} />
        <Tile label="No-show rate" value={percent(totals.noShowRate)} />
        <Tile label="Chats that booked" value={percent(assistant.conversionRate)} />
      </dl>

      <SectionCard description={`Visits booked for each day, in ${data.timeZone.replaceAll("_", " ")}.`} title="Visits by day">
        <BarChart
          items={data.days.map((day) => ({
            key: day.date,
            label: formatLocalDateLabel(day.date),
            value: day.visits,
            detail: `${day.visits} visits, ${day.cancelled} cancelled, ${day.noShows} no-shows, ${formatMoney(day.revenueMinor, data.currency)}`,
          }))}
          showEvery={Math.ceil(data.days.length / 10)}
        />
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard description="Visits by the hour they start, over the whole range." title="Busiest hours">
          <BarChart
            items={hourSpan.map((hour) => ({
              key: String(hour.hour),
              label: `${hour.hour % 12 === 0 ? 12 : hour.hour % 12}${hour.hour < 12 ? "a" : "p"}`,
              value: hour.visits,
              detail: `${hour.visits} visits starting ${hour.hour}:00–${hour.hour + 1}:00`,
            }))}
          />
        </SectionCard>

        <SectionCard description="Booked time out of working hours, after time off and closures." title="Provider utilisation">
          {data.providers.length === 0 ? (
            <p className="text-sm text-muted">No active providers.</p>
          ) : (
            <ul className="space-y-3">
              {data.providers.map((provider) => (
                <li key={provider.staffId}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink">{provider.name}</span>
                    <span className="text-muted">
                      {percent(provider.utilisation)} · {hours(provider.bookedMinutes)} of {hours(provider.openMinutes)}
                    </span>
                  </div>
                  <Meter value={provider.utilisation ?? 0} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard description="Chats where the customer wrote something, by the day they began." title="Booking assistant">
        <dl className="grid gap-3 sm:grid-cols-4">
          <Tile label="Chats" value={String(assistant.chatsStarted)} />
          <Tile label="Booked" value={`${assistant.chatsBooked} (${percent(assistant.conversionRate)})`} />
          <Tile label="Messages to book" value={assistant.averageTurnsToBook === null ? "–" : String(assistant.averageTurnsToBook)} />
          <Tile label="Passed to staff" value={`${assistant.handoffs} (${percent(assistant.handoffRate)})`} />
        </dl>
        <div className="mt-5">
          <p className="text-sm font-semibold text-ink">Where chats that didn&apos;t book stopped</p>
          <ul className="mt-2 space-y-3">
            {[
              { label: "Before choosing a service", value: assistant.dropOff.beforeChoosingService },
              { label: "After choosing a service", value: assistant.dropOff.afterChoosingService },
              { label: "With a time held", value: assistant.dropOff.atHeldTime },
            ].map((step) => (
              <li key={step.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-soft">{step.label}</span>
                  <span className="text-muted">{step.value}</span>
                </div>
                <Meter value={stopped > 0 ? step.value / stopped : 0} />
              </li>
            ))}
          </ul>
        </div>
      </SectionCard>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-ink">{value}</dd>
    </div>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-subtle">
      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.round(value * 100))}%` }} />
    </div>
  );
}

interface Bar {
  key: string;
  label: string;
  value: number;
  /** Read out and shown on hover. */
  detail: string;
}

/** Vertical bars scaled to the largest value; every `showEvery`-th label is printed. */
function BarChart({ items, showEvery = 1 }: { items: Bar[]; showEvery?: number }) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <div>
      <ol className="flex h-40 items-end gap-1" aria-label="Bar chart">
        {items.map((item) => (
          <li className="flex h-full min-w-0 flex-1 flex-col justify-end" key={item.key} title={item.detail}>
            <span className="sr-only">
              {item.label}: {item.detail}
            </span>
            <span
              aria-hidden="true"
              className={cn("block rounded-t-[3px]", item.value > 0 ? "bg-brand" : "bg-border")}
              style={{ height: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </li>
        ))}
      </ol>
      <div aria-hidden="true" className="mt-1 flex gap-1">
        {items.map((item, index) => (
          <span className="min-w-0 flex-1 truncate text-center text-[10px] text-subtle" key={item.key}>
            {index % showEvery === 0 ? item.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
