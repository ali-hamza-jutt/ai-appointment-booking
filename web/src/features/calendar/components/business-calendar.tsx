"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { SelectField } from "@/components/ui/form-controls";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { BookingDetailModal } from "@/features/bookings/components/booking-detail-modal";
import { ManualBookingModal } from "@/features/bookings/components/manual-booking-modal";
import { BOOKING_STATUS_PRESENTATION } from "@/features/bookings/constants/booking-status.constants";
import { formatTimeRange } from "@/features/bookings/utils/booking-format";
import { BusinessRequired } from "@/features/business-settings/components/business-required";
import { useBusinessEvents } from "@/features/business-settings/hooks/use-business-events";
import { canManageBusiness } from "@/features/business-settings/utils/business-permissions";
import { useRangeBookings } from "@/features/calendar/hooks/use-range-bookings";
import {
  CALENDAR_CONSTANTS,
  formatHourLabel,
  isoWeekday,
  layoutColumn,
  minutesToTime,
  snapMinutes,
  timeToMinutes,
  toLocalPoint,
  visibleHours,
  weekStart,
} from "@/features/calendar/utils/calendar-layout";
import { useListWorkingHours } from "@/generated/api/availability/availability";
import { getListBookingsQueryKey, useRescheduleBooking } from "@/generated/api/bookings/bookings";
import { useGetBusiness } from "@/generated/api/businesses/businesses";
import { useListServices } from "@/generated/api/catalog/catalog";
import type { BookingResponse, BookingStatus, BusinessResponse, BusinessSummaryResponse, StaffResponse } from "@/generated/api/models";
import { useListStaff } from "@/generated/api/staff/staff";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { cn } from "@/lib/utils/cn";
import { addDaysToDate, formatLocalDateLabel, getCurrentLocalDate, zonedDateTimeToIso } from "@/lib/utils/date-time";

type CalendarView = "day" | "week";

const VIEWS = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
] as const;

/** Bookings that no longer hold their time are left off the grid. */
const HIDDEN: ReadonlySet<BookingStatus> = new Set(["CANCELLED", "EXPIRED"]);
/** Bookings that can still be moved by dragging. */
const MOVABLE: ReadonlySet<BookingStatus> = new Set(["CONFIRMED", "PENDING"]);

const BLOCK_TONES: Record<string, string> = {
  brand: "border-brand/40 bg-brand-soft text-ink",
  success: "border-success-border bg-success-soft text-ink",
  warning: "border-warning-border bg-warning-soft text-ink",
  danger: "border-danger-border bg-danger-soft text-ink",
  neutral: "border-border bg-surface-subtle text-muted",
};

interface CalendarItem {
  id: string;
  start: number;
  end: number;
  date: string;
  booking: BookingResponse;
}

interface Column {
  key: string;
  label: string;
  date: string;
  /** The provider the column shows, whose working hours are shaded and who a drop moves the booking to. */
  staffId: string | null;
  items: CalendarItem[];
}

interface PendingMove {
  booking: BookingResponse;
  date: string;
  minutes: number;
  staffId: string | null;
  staffName: string | null;
}

interface NewBookingAt {
  date: string;
  minutes: number;
  staffId: string | null;
}

export function BusinessCalendar() {
  return <BusinessRequired>{(business) => <CalendarLoader summary={business} />}</BusinessRequired>;
}

function CalendarLoader({ summary }: { summary: BusinessSummaryResponse }) {
  const businessQuery = useGetBusiness(summary.id);

  if (businessQuery.isPending) {
    return (
      <PageContainer size="wide">
        <Skeleton className="h-[32rem] rounded-xl" />
      </PageContainer>
    );
  }

  if (businessQuery.isError) {
    return (
      <PageContainer size="wide">
        <Alert tone="danger">{getApiErrorMessage(businessQuery.error, "The calendar could not be loaded.")}</Alert>
      </PageContainer>
    );
  }

  return <CalendarContent business={businessQuery.data} />;
}

function CalendarContent({ business }: { business: BusinessResponse }) {
  const queryClient = useQueryClient();
  const timeZone = business.timeZone;
  const [view, setView] = useState<CalendarView>("day");
  const [date, setDate] = useState(() => getCurrentLocalDate(timeZone));
  const [providerId, setProviderId] = useState("");
  const [selected, setSelected] = useState<BookingResponse | null>(null);
  const [creating, setCreating] = useState<NewBookingAt | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const isLive = useBusinessEvents(business.id);
  const staffQuery = useListStaff(business.id);
  const servicesQuery = useListServices(business.id);
  const rangeStart = view === "day" ? date : weekStart(date);
  const days = view === "day" ? 1 : 7;
  const bookingsQuery = useRangeBookings(business.id, rangeStart, days, timeZone);
  const rescheduleMutation = useRescheduleBooking({
    mutation: {
      onSettled: () => queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey(business.id) }),
      onSuccess: () => setPendingMove(null),
    },
  });
  const staff = (staffQuery.data?.items ?? []).filter((member) => member.isActive);
  const activeServices = (servicesQuery.data?.items ?? []).filter((service) => service.isActive);
  const items = toItems(bookingsQuery.data ?? [], timeZone);
  const columns =
    view === "day" ? dayColumns(date, staff, items) : weekColumns(rangeStart, providerId, staff, items);
  const hours = visibleHours(columns.flatMap((column) => column.items));
  const today = getCurrentLocalDate(timeZone);

  function shift(direction: -1 | 1) {
    setDate((current) => addDaysToDate(current, direction * days));
  }

  function requestMove(bookingId: string, column: Column, minutes: number) {
    const booking = bookingsQuery.data?.find((item) => item.id === bookingId);

    if (!booking) return;

    const staffId = column.staffId && column.staffId !== booking.staff?.id ? column.staffId : null;

    rescheduleMutation.reset();
    setPendingMove({
      booking,
      date: column.date,
      minutes,
      staffId,
      staffName: staffId ? (staff.find((member) => member.id === staffId)?.displayName ?? null) : null,
    });
  }

  function confirmMove() {
    if (!pendingMove) return;

    const startsAt = zonedDateTimeToIso(pendingMove.date, minutesToTime(pendingMove.minutes), timeZone);

    if (!startsAt) return;

    rescheduleMutation.mutate({
      businessId: business.id,
      bookingId: pendingMove.booking.id,
      data: { startsAt, ...(pendingMove.staffId ? { staffId: pendingMove.staffId } : {}) },
    });
  }

  return (
    <PageContainer size="wide">
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <Badge className="gap-1.5" tone={isLive ? "success" : "neutral"}>
              <span className={cn("size-1.5 rounded-full bg-current", isLive && "animate-bw-pulse")} />
              {isLive ? "Live" : "Reconnecting"}
            </Badge>
            <Button
              disabled={activeServices.length === 0}
              leadingIcon={<PlusIcon className="size-4" />}
              onClick={() => setCreating({ date, minutes: -1, staffId: providerId || null })}
            >
              New booking
            </Button>
          </div>
        }
        description={`Drag a booking to move it, or click a free time to book a walk-in or phone customer. Times are in ${timeZone.replaceAll("_", " ")}.`}
        title="Calendar"
      />

      <Tabs ariaLabel="Calendar view" controls="calendar-grid" onChange={setView} options={VIEWS} value={view} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <Button aria-label={`Previous ${view}`} onClick={() => shift(-1)} size="sm" variant="secondary">
            <ArrowLeftIcon className="size-4" />
          </Button>
          <Button onClick={() => setDate(today)} size="sm" variant="secondary">
            Today
          </Button>
          <Button aria-label={`Next ${view}`} onClick={() => shift(1)} size="sm" variant="secondary">
            <ArrowRightIcon className="size-4" />
          </Button>
        </div>
        {view === "week" ? (
          <div className="w-52">
            <SelectField
              hideLabel
              id="calendar-provider"
              label="Provider"
              onChange={(event) => setProviderId(event.target.value)}
              value={providerId}
            >
              <option value="">Everyone</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </SelectField>
          </div>
        ) : null}
        <p className="ml-auto text-sm font-semibold text-ink">
          {view === "day"
            ? formatLocalDateLabel(date)
            : `${formatLocalDateLabel(rangeStart)} – ${formatLocalDateLabel(addDaysToDate(rangeStart, 6))}`}
        </p>
      </div>

      {bookingsQuery.isError ? (
        <Alert className="mb-4" tone="danger">
          {getApiErrorMessage(bookingsQuery.error, "Bookings could not be loaded.")}
        </Alert>
      ) : null}

      {bookingsQuery.isPending || staffQuery.isPending ? (
        <Skeleton className="h-[32rem] rounded-xl" />
      ) : (
        <div className="bw-scrollbar overflow-x-auto rounded-xl border border-border bg-surface shadow-card" id="calendar-grid" role="tabpanel">
          <div className="flex min-w-max">
            <HourLabels endHour={hours.endHour} startHour={hours.startHour} />
            {columns.map((column) => (
              <CalendarColumn
                businessId={business.id}
                column={column}
                endHour={hours.endHour}
                isToday={column.date === today}
                key={column.key}
                onBook={(minutes) => setCreating({ date: column.date, minutes, staffId: column.staffId })}
                onMove={(bookingId, minutes) => requestMove(bookingId, column, minutes)}
                onOpen={setSelected}
                startHour={hours.startHour}
                timeZone={timeZone}
                wide={view === "day"}
              />
            ))}
          </div>
        </div>
      )}

      <Modal
        description="The customer is emailed the new time."
        isOpen={pendingMove !== null}
        onClose={() => setPendingMove(null)}
        title="Move this booking?"
      >
        {pendingMove ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              {pendingMove.booking.customer.name}&apos;s {pendingMove.booking.serviceName} moves to{" "}
              <strong className="text-ink">
                {formatLocalDateLabel(pendingMove.date)} at {minutesToTime(pendingMove.minutes)}
              </strong>
              {pendingMove.staffName ? (
                <>
                  {" "}
                  with <strong className="text-ink">{pendingMove.staffName}</strong>
                </>
              ) : null}
              .
            </p>
            {rescheduleMutation.error ? (
              <Alert tone="danger">
                {getApiErrorMessage(rescheduleMutation.error, "The booking could not be moved to that time.")}
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPendingMove(null)} variant="secondary">
                Cancel
              </Button>
              <Button isLoading={rescheduleMutation.isPending} onClick={confirmMove}>
                Move booking
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {creating ? (
        <ManualBookingModal
          businessId={business.id}
          initialDate={creating.date}
          onClose={() => setCreating(null)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey(business.id) });
            setCreating(null);
          }}
          services={activeServices}
          staff={staffQuery.data?.items ?? []}
          timeZone={timeZone}
          {...(creating.staffId ? { initialStaffId: creating.staffId } : {})}
          {...(creating.minutes >= 0
            ? { initialStartsAt: zonedDateTimeToIso(creating.date, minutesToTime(creating.minutes), timeZone) ?? "" }
            : {})}
        />
      ) : null}

      {selected ? (
        <BookingDetailModal
          booking={selected}
          businessId={business.id}
          businessSlug={business.slug}
          canManage={canManageBusiness(business.role)}
          onClose={() => {
            setSelected(null);
            void queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey(business.id) });
          }}
          timeZone={timeZone}
        />
      ) : null}
    </PageContainer>
  );
}

function toItems(bookings: BookingResponse[], timeZone: string): CalendarItem[] {
  return bookings.flatMap((booking) => {
    if (HIDDEN.has(booking.status)) return [];

    const start = toLocalPoint(booking.scheduledAt, timeZone);
    const end = toLocalPoint(booking.endsAt, timeZone);

    if (!start || !end) return [];

    // A visit running past midnight is drawn to the end of its first day.
    const endMinutes = end.date === start.date ? end.minutes : 24 * 60;

    return [{ id: booking.id, start: start.minutes, end: Math.max(endMinutes, start.minutes + 5), date: start.date, booking }];
  });
}

function dayColumns(date: string, staff: StaffResponse[], items: CalendarItem[]): Column[] {
  const onDay = items.filter((item) => item.date === date);
  const columns: Column[] = staff.map((member) => ({
    key: member.id,
    label: member.displayName,
    date,
    staffId: member.id,
    items: onDay.filter((item) => item.booking.staff?.id === member.id),
  }));
  const known = new Set(staff.map((member) => member.id));
  const others = onDay.filter((item) => !item.booking.staff || !known.has(item.booking.staff.id));

  if (others.length > 0 || columns.length === 0) {
    columns.push({ key: "unassigned", label: "No provider", date, staffId: null, items: others });
  }

  return columns;
}

function weekColumns(start: string, providerId: string, staff: StaffResponse[], items: CalendarItem[]): Column[] {
  const provider = staff.find((member) => member.id === providerId) ?? null;

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToDate(start, index);

    return {
      key: date,
      label: formatLocalDateLabel(date),
      date,
      staffId: provider?.id ?? null,
      items: items.filter((item) => item.date === date && (!provider || item.booking.staff?.id === provider.id)),
    };
  });
}

function HourLabels({ endHour, startHour }: { endHour: number; startHour: number }) {
  const hourHeight = 60 * CALENDAR_CONSTANTS.PX_PER_MINUTE;

  return (
    <div className="sticky left-0 z-10 w-16 shrink-0 border-r border-border bg-surface">
      <div className="h-10 border-b border-border" />
      <div className="relative" style={{ height: (endHour - startHour) * hourHeight }}>
        {Array.from({ length: endHour - startHour }, (_, index) => (
          <span
            className="absolute right-2 -translate-y-1/2 text-[11px] text-muted first:translate-y-0"
            key={index}
            style={{ top: index * hourHeight }}
          >
            {formatHourLabel(startHour + index)}
          </span>
        ))}
      </div>
    </div>
  );
}

interface CalendarColumnProps {
  businessId: string;
  column: Column;
  startHour: number;
  endHour: number;
  isToday: boolean;
  timeZone: string;
  wide: boolean;
  onBook: (minutes: number) => void;
  onMove: (bookingId: string, minutes: number) => void;
  onOpen: (booking: BookingResponse) => void;
}

/** Where in its block a booking was grabbed, so a drop keeps it under the pointer. */
const dragState: { bookingId: string | null; grabMinutes: number } = { bookingId: null, grabMinutes: 0 };

function CalendarColumn({
  businessId,
  column,
  endHour,
  isToday,
  onBook,
  onMove,
  onOpen,
  startHour,
  timeZone,
  wide,
}: CalendarColumnProps) {
  const px = CALENDAR_CONSTANTS.PX_PER_MINUTE;
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [isOver, setIsOver] = useState(false);
  const hoursQuery = useListWorkingHours(businessId, column.staffId ?? "", { query: { enabled: Boolean(column.staffId) } });
  const weekday = isoWeekday(column.date);
  const open = column.staffId
    ? (hoursQuery.data?.items ?? [])
        .filter((interval) => interval.weekday === weekday)
        .map((interval) => ({
          start: timeToMinutes(interval.startTime),
          end: interval.endsNextDay ? 24 * 60 : timeToMinutes(interval.endTime),
        }))
    : [{ start: 0, end: 24 * 60 }];
  const now = useNowMinutes(timeZone);
  const height = (endHour - startHour) * 60 * px;

  function minutesAt(clientY: number): number {
    const top = bodyRef.current?.getBoundingClientRect().top ?? 0;

    return startHour * 60 + (clientY - top) / px;
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-booking]")) return;

    onBook(snapMinutes(minutesAt(event.clientY) - CALENDAR_CONSTANTS.SNAP_MINUTES / 2));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsOver(false);

    const bookingId = event.dataTransfer.getData("text/plain") || dragState.bookingId;

    if (bookingId) onMove(bookingId, snapMinutes(minutesAt(event.clientY) - dragState.grabMinutes));
    dragState.bookingId = null;
  }

  return (
    <div className={cn("shrink-0 border-r border-border last:border-r-0", wide ? "w-56" : "w-40")}>
      <div className="flex h-10 items-center justify-center border-b border-border px-2 text-center">
        <span className={cn("truncate text-xs font-semibold", isToday ? "text-brand" : "text-ink")}>{column.label}</span>
      </div>
      <div
        className={cn("relative cursor-pointer bg-surface-subtle", isOver && "ring-2 ring-inset ring-brand/40")}
        onClick={handleClick}
        onDragLeave={() => setIsOver(false)}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setIsOver(true);
        }}
        onDrop={handleDrop}
        ref={bodyRef}
        style={{ height }}
      >
        {open.map((interval) => {
          const top = Math.max(0, (interval.start - startHour * 60) * px);
          const bottom = Math.min(height, (interval.end - startHour * 60) * px);

          return bottom > top ? (
            <div aria-hidden="true" className="absolute inset-x-0 bg-surface" key={interval.start} style={{ top, height: bottom - top }} />
          ) : null;
        })}
        {Array.from({ length: endHour - startHour }, (_, index) => (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 border-t border-border/70"
            key={index}
            style={{ top: index * 60 * px }}
          />
        ))}
        {isToday && now >= startHour * 60 && now <= endHour * 60 ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-danger"
            style={{ top: (now - startHour * 60) * px }}
          />
        ) : null}
        {layoutColumn(column.items).map(({ item, lane, lanes }) => (
          <BookingBlock
            item={item}
            key={item.id}
            lane={lane}
            lanes={lanes}
            onOpen={onOpen}
            startHour={startHour}
            timeZone={timeZone}
          />
        ))}
      </div>
    </div>
  );
}

function BookingBlock({
  item,
  lane,
  lanes,
  onOpen,
  startHour,
  timeZone,
}: {
  item: CalendarItem;
  lane: number;
  lanes: number;
  onOpen: (booking: BookingResponse) => void;
  startHour: number;
  timeZone: string;
}) {
  const px = CALENDAR_CONSTANTS.PX_PER_MINUTE;
  const { booking } = item;
  const presentation = BOOKING_STATUS_PRESENTATION[booking.status];
  const movable = MOVABLE.has(booking.status);

  return (
    <button
      className={cn(
        "absolute z-10 overflow-hidden rounded-[6px] border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand",
        BLOCK_TONES[presentation.tone],
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
      )}
      data-booking={booking.id}
      draggable={movable}
      onClick={() => onOpen(booking)}
      onDragStart={(event) => {
        const top = event.currentTarget.getBoundingClientRect().top;

        dragState.bookingId = booking.id;
        dragState.grabMinutes = (event.clientY - top) / px;
        event.dataTransfer.setData("text/plain", booking.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      style={{
        top: (item.start - startHour * 60) * px,
        height: Math.max(18, (item.end - item.start) * px - 2),
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
      }}
      title={`${booking.customer.name} · ${booking.serviceName} · ${presentation.label}`}
      type="button"
    >
      <span className="block truncate font-semibold">{booking.customer.name}</span>
      <span className="block truncate text-muted">
        {formatTimeRange(booking, timeZone)} · {booking.serviceName}
      </span>
    </button>
  );
}

/** Minutes since local midnight in the business time zone, refreshed every minute. */
function useNowMinutes(timeZone: string): number {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);

    return () => clearInterval(timer);
  }, []);

  return toLocalPoint(now, timeZone)?.minutes ?? -1;
}
