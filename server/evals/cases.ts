/**
 * Scripted conversations for the booking assistant. The clock is frozen at
 * FROZEN_NOW (a Monday) and the business works Monday to Saturday,
 * 09:00–17:00 UTC, so relative dates have one right answer.
 */
export const FROZEN_NOW = new Date("2026-11-02T08:00:00.000Z");

export const EVAL_SERVICES = [
  { name: "Haircut", durationMinutes: 60 },
  { name: "Beard trim", durationMinutes: 30 },
  { name: "Hair colouring", durationMinutes: 90 },
] as const;

export type EvalExpectation =
  /** A hold at this UTC start time for this service. */
  | { outcome: "held"; service: string; startsAt: string }
  /** No hold; the assistant asks for what is missing. */
  | { outcome: "clarify" }
  /** No hold; the request is outside booking and is declined. */
  | { outcome: "refused" }
  /** No hold; the time can't be booked and other times are offered. */
  | { outcome: "alternatives" };

export interface EvalCase {
  id: string;
  description: string;
  turns: string[];
  expect: EvalExpectation;
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "explicit-date",
    description: "Service, date and time in one message",
    turns: ["Please book a haircut on 2026-11-03 at 10:00"],
    expect: { outcome: "held", service: "Haircut", startsAt: "2026-11-03T10:00:00.000Z" },
  },
  {
    id: "relative-tomorrow",
    description: "Relative day and 12-hour time",
    turns: ["Can I get a haircut tomorrow at 2pm?"],
    expect: { outcome: "held", service: "Haircut", startsAt: "2026-11-03T14:00:00.000Z" },
  },
  {
    id: "weekday-name",
    description: "A weekday later this week",
    turns: ["I'd like a beard trim this Friday at 11am"],
    expect: { outcome: "held", service: "Beard trim", startsAt: "2026-11-06T11:00:00.000Z" },
  },
  {
    id: "fuzzy-service",
    description: "Service name that differs from the catalog",
    turns: ["hair color on Thursday at 9am please"],
    expect: { outcome: "held", service: "Hair colouring", startsAt: "2026-11-05T09:00:00.000Z" },
  },
  {
    id: "clarify-then-book",
    description: "Missing time is asked for, then supplied",
    turns: ["I need a haircut", "Wednesday at 3pm works"],
    expect: { outcome: "held", service: "Haircut", startsAt: "2026-11-04T15:00:00.000Z" },
  },
  {
    id: "correct-time",
    description: "The user changes only the time of the draft",
    turns: ["Haircut tomorrow at 10", "Actually make it 11:30 instead"],
    expect: { outcome: "held", service: "Haircut", startsAt: "2026-11-03T11:30:00.000Z" },
  },
  {
    id: "missing-time",
    description: "No time given, so nothing is held yet",
    turns: ["Can I book a beard trim?"],
    expect: { outcome: "clarify" },
  },
  {
    id: "closed-day",
    description: "The business is closed on Sundays",
    turns: ["Book a haircut this Sunday at 10am"],
    expect: { outcome: "alternatives" },
  },
  {
    id: "out-of-scope-weather",
    description: "Unrelated question",
    turns: ["What's the weather going to be like in Paris tomorrow?"],
    expect: { outcome: "refused" },
  },
  {
    id: "out-of-scope-poem",
    description: "Unrelated task",
    turns: ["Write me a short poem about cats"],
    expect: { outcome: "refused" },
  },
];
