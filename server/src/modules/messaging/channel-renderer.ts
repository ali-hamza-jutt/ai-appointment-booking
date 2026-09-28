import { MESSAGING_CONSTANTS } from "../../constants/app.constants.js";
import type { ChatAction, ChatBookingSummary, ChatConfirmPart, ChatMessagePart } from "../chat/dto/chat.dto.js";

export type TextChannel = "SMS" | "WHATSAPP";

/** Something the customer can pick by replying with its number. */
export interface NumberedOption {
  label: string;
  action: ChatAction;
}

const YES = new Set<string>(MESSAGING_CONSTANTS.YES_WORDS);

function formatStart(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(startsAt));
}

function formatPrice(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;

  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 10 ** digits);
}

function describeBooking(booking: ChatBookingSummary): string {
  return `${booking.serviceName}${booking.staffName ? ` with ${booking.staffName}` : ""}, ${formatStart(booking.startsAt, booking.timeZone)}`;
}

/**
 * What a reply offers, in the order it lists them: its times, else its
 * services, else its buttons when there are several. A reply to the number
 * picks the option the same way a tap does on the web.
 */
export function numberedOptions(parts: ChatMessagePart[]): NumberedOption[] {
  const max = MESSAGING_CONSTANTS.MAX_OPTIONS;
  const picker = parts.find((part) => part.type === "slot_picker");

  if (picker?.type === "slot_picker" && picker.slots.length > 0) {
    return picker.slots.slice(0, max).map((slot) => ({
      label: `${formatStart(slot.startsAt, picker.timeZone)}${slot.staffName ? ` with ${slot.staffName}` : ""}`,
      action: picker.rescheduleBookingId
        ? { type: "reschedule_booking", bookingId: picker.rescheduleBookingId, slotToken: slot.token }
        : { type: "select_slot", slotToken: slot.token },
    }));
  }

  const cards = parts.find((part) => part.type === "service_cards");

  if (cards?.type === "service_cards" && cards.services.length > 0) {
    return cards.services.slice(0, max).map((service) => ({
      label: `${service.name} (${service.durationMinutes} min, ${service.priceMinor > 0 ? formatPrice(service.priceMinor, service.currency) : "free"})`,
      action: { type: "select_service", serviceId: service.id },
    }));
  }

  const buttons = confirmParts(parts);

  return buttons.length > 1 ? buttons.slice(0, max).map((part) => ({ label: part.label, action: part.action })) : [];
}

function confirmParts(parts: ChatMessagePart[]): ChatConfirmPart[] {
  return parts.filter((part): part is ChatConfirmPart => part.type === "confirm");
}

/**
 * Reads a text reply against the assistant's last message: a number picks
 * one of its options, and "yes" presses its only button. Anything else is
 * a message for the assistant.
 */
export function interpretReply(text: string, lastParts: ChatMessagePart[]): ChatAction | null {
  const reply = text.trim().toLowerCase().replace(/[.!]+$/, "");
  const options = numberedOptions(lastParts);

  if (/^\d{1,2}$/.test(reply)) return options[Number(reply) - 1]?.action ?? null;

  const buttons = confirmParts(lastParts);

  if (YES.has(reply) && options.length === 0 && buttons.length === 1) return buttons[0]?.action ?? null;

  return null;
}

/** An assistant reply as one text message, with its cards written out. */
export function renderReply(content: string, parts: ChatMessagePart[], channel: TextChannel): string {
  const lines = [content.trim()];
  const options = numberedOptions(parts);
  const buttons = confirmParts(parts);

  for (const part of parts) {
    if (part.type === "booking_summary") lines.push(describeBooking(part.booking));
    if (part.type === "booking_list") lines.push(...part.bookings.map((booking) => `- ${describeBooking(booking)}`));
    if (part.type === "payment_link") lines.push(`${part.label}: ${part.url}`);
  }

  if (options.length > 0) {
    lines.push(options.map((option, index) => `${index + 1}. ${option.label}`).join("\n"));
    lines.push("Reply with a number.");
  } else if (buttons.length === 1 && buttons[0]) {
    lines.push(`Reply YES to ${buttons[0].label.charAt(0).toLowerCase()}${buttons[0].label.slice(1)}.`);
  }

  const text = lines.filter(Boolean).join("\n\n");
  const limit = channel === "SMS" ? MESSAGING_CONSTANTS.SMS_MAX_LENGTH : MESSAGING_CONSTANTS.WHATSAPP_MAX_LENGTH;

  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
