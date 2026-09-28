export interface AnalyticsDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Bookings first confirmed or requested that day. */
  bookingsMade: number;
  /** Visits booked for that day that weren't cancelled. */
  visits: number;
  completed: number;
  cancelled: number;
  noShows: number;
  /** Price of the visits completed that day, in minor units of the business currency. */
  revenueMinor: number;
}

export interface AnalyticsTotals extends Omit<AnalyticsDay, "date"> {
  /** Cancelled out of all visits booked for the range; null with none. */
  cancellationRate: number | null;
  /** No-shows out of visits that were due (completed or no-show); null with none. */
  noShowRate: number | null;
}

export interface HourCount {
  /** Local starting hour, 0 to 23. */
  hour: number;
  visits: number;
}

export interface ProviderUtilisation {
  staffId: string;
  name: string;
  bookedMinutes: number;
  /** Working hours in the range, less time off and closures. */
  openMinutes: number;
  /** Booked out of open minutes; null when they had no working hours. */
  utilisation: number | null;
}

export interface AssistantAnalytics {
  /** Chats where the customer wrote at least one message. */
  chatsStarted: number;
  chatsBooked: number;
  conversionRate: number | null;
  /** Customer messages it took, on average, to book. */
  averageTurnsToBook: number | null;
  handoffs: number;
  handoffRate: number | null;
  /** Where chats that didn't book stopped. */
  dropOff: {
    beforeChoosingService: number;
    afterChoosingService: number;
    atHeldTime: number;
  };
}

export interface AnalyticsResponse {
  from: string;
  to: string;
  timeZone: string;
  currency: string;
  days: AnalyticsDay[];
  totals: AnalyticsTotals;
  busiestHours: HourCount[];
  providers: ProviderUtilisation[];
  assistant: AssistantAnalytics;
}

/** Metric name → value, for each local date. */
export type DailyMetrics = Map<string, Map<string, number>>;
