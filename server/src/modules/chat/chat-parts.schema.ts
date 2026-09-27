import { z } from "zod";

import type { ChatAction, ChatMessagePart } from "./dto/chat.dto.js";

const isoInstant = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

const bookingSummary = z.object({
  bookingId: z.string(),
  serviceName: z.string(),
  staffName: z.string().nullable(),
  startsAt: isoInstant,
  endsAt: isoInstant,
  durationMinutes: z.number(),
  priceMinor: z.number().nullable(),
  currency: z.string().nullable(),
  status: z.string(),
  holdExpiresAt: isoInstant.nullable(),
  timeZone: z.string(),
});

export const chatActionSchema: z.ZodType<ChatAction> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("select_service"), serviceId: z.uuid(), staffId: z.uuid().optional() }),
  z.object({ type: z.literal("select_slot"), slotToken: z.string().min(10).max(1_000) }),
  z.object({ type: z.literal("confirm_booking") }),
  z.object({ type: z.literal("cancel_booking"), bookingId: z.uuid() }),
  z.object({
    type: z.literal("reschedule_booking"),
    bookingId: z.uuid(),
    slotToken: z.string().min(10).max(1_000),
  }),
]);

const partSchema: z.ZodType<ChatMessagePart> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("service_cards"),
    services: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        durationMinutes: z.number(),
        priceMinor: z.number(),
        currency: z.string(),
      }),
    ),
  }),
  z.object({
    type: z.literal("slot_picker"),
    serviceId: z.string(),
    serviceName: z.string(),
    timeZone: z.string(),
    slots: z.array(
      z.object({
        token: z.string(),
        startsAt: isoInstant,
        endsAt: isoInstant,
        staffName: z.string().nullable(),
        seatsLeft: z.number().nullable(),
      }),
    ),
    rescheduleBookingId: z.string().optional(),
  }),
  z.object({ type: z.literal("booking_summary"), booking: bookingSummary }),
  z.object({ type: z.literal("booking_list"), bookings: z.array(bookingSummary) }),
  z.object({
    type: z.literal("confirm"),
    label: z.string(),
    description: z.string(),
    tone: z.enum(["primary", "danger"]),
    action: chatActionSchema,
  }),
  z.object({
    type: z.literal("payment_link"),
    label: z.string(),
    url: z.string(),
    amountMinor: z.number(),
    currency: z.string(),
    expiresAt: isoInstant,
  }),
]) as z.ZodType<ChatMessagePart>;

/** Stored parts that still match the current shapes; anything else is dropped. */
export function parseStoredParts(value: unknown): ChatMessagePart[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const parsed = partSchema.safeParse(item);

    return parsed.success ? [parsed.data] : [];
  });
}
