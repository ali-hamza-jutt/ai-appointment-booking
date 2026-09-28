import { z } from "zod";

import type { AgentTool } from "../../../integrations/ai/agent/agent.dto.js";
import type { ChatMessagePart } from "../dto/chat.dto.js";
import {
  bookingAssistantService,
  PREFERENCE_KINDS,
  type AssistantContext,
} from "./booking-assistant.service.js";

type BookingTool = AgentTool<AssistantContext, ChatMessagePart, never>;

const uuid = z.uuid();
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const slotToken = z.string().min(10).describe("A slotToken exactly as returned by get_availability");
const preferenceKind = z.enum(PREFERENCE_KINDS).describe("provider, service or part_of_day");

function tool<Args>(definition: AgentTool<AssistantContext, ChatMessagePart, Args>): BookingTool {
  return definition as unknown as BookingTool;
}

/**
 * The booking tools. Each validates its arguments with Zod and runs with the
 * session's business and customer; ids the model supplies are checked for
 * ownership before anything is read or proposed.
 */
export const bookingTools: BookingTool[] = [
  tool({
    name: "search_services",
    description:
      "Find services this business offers. Pass what the customer asked for as query, or omit it to list services. Returns up to 5 with serviceId, price and duration.",
    schema: z.object({ query: z.string().max(120).optional() }),
    handler: (args, context) => bookingAssistantService.searchServices(context, args.query),
  }),
  tool({
    name: "list_staff",
    description: "Providers who offer a service, each with their next free date.",
    schema: z.object({ serviceId: uuid }),
    handler: (args, context) => bookingAssistantService.listStaff(context, args.serviceId),
  }),
  tool({
    name: "get_availability",
    description:
      "Open start times for a service from a date, optionally for one provider and part of day. If the customer named a time, pass it as time: the result says whether it is open and lists the nearest open times. Each slot has a slotToken; only these times can be offered or booked. To move an existing booking, pass rescheduleBookingId.",
    schema: z.object({
      serviceId: uuid,
      date: localDate.describe("First local date to check, YYYY-MM-DD"),
      days: z.number().int().min(1).max(7).optional().describe("How many days to check, default 1"),
      staffId: uuid.optional(),
      partOfDay: z.enum(["morning", "afternoon", "evening"]).optional(),
      time: z
        .string()
        .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm, 24-hour")
        .optional()
        .describe("A specific local time the customer asked for"),
      rescheduleBookingId: uuid.optional(),
    }),
    handler: (args, context) => bookingAssistantService.getAvailability(context, args),
  }),
  tool({
    name: "propose_booking",
    description:
      "Hold an offered slot for the customer for a few minutes and show them a confirmation card. The customer must press Confirm booking; never say it is booked.",
    schema: z.object({ slotToken, notes: z.string().max(500).optional() }),
    handler: (args, context) => bookingAssistantService.proposeBooking(context, args),
  }),
  tool({
    name: "list_my_bookings",
    description: "The customer's upcoming bookings at this business, with whether each can still be cancelled or moved.",
    schema: z.object({}),
    handler: (_args, context) => bookingAssistantService.listMyBookings(context),
  }),
  tool({
    name: "propose_cancel",
    description: "Show a button the customer can press to cancel one of their bookings. Does not cancel by itself.",
    schema: z.object({ bookingId: uuid }),
    handler: (args, context) => bookingAssistantService.proposeCancel(context, args.bookingId),
  }),
  tool({
    name: "propose_reschedule",
    description:
      "Show a button the customer can press to move one of their bookings to an offered slot (get_availability with rescheduleBookingId). Does not move it by itself.",
    schema: z.object({ bookingId: uuid, slotToken }),
    handler: (args, context) => bookingAssistantService.proposeReschedule(context, args),
  }),
  tool({
    name: "search_knowledge",
    description:
      "Search this business's FAQs, policies and preparation instructions (opening hours, parking, cancellation rules, what to bring, pricing questions not about a specific service). Returns up to 4 passages with their source title.",
    schema: z.object({ query: z.string().min(2).max(500).describe("The customer's question in a few words") }),
    handler: (args, context) => bookingAssistantService.searchKnowledge(context, args.query),
  }),
  tool({
    name: "join_waitlist",
    description:
      "Put the customer on the waitlist for a service between two dates, when no open time suits them and they agree to wait. If a time opens up it is held for them for 15 minutes and they get a message to confirm it.",
    schema: z.object({
      serviceId: uuid,
      fromDate: localDate.describe("First local date they could come, YYYY-MM-DD"),
      toDate: localDate.optional().describe("Last local date, YYYY-MM-DD; defaults to a week after fromDate"),
      staffId: uuid.optional().describe("Only when they want this provider and nobody else"),
      partOfDay: z.enum(["morning", "afternoon", "evening"]).optional(),
    }),
    handler: (args, context) => bookingAssistantService.joinWaitlist(context, args),
  }),
  tool({
    name: "remember_preference",
    description:
      "Save a lasting preference the customer stated explicitly, for their next bookings here. value is the staffId for provider, the serviceId for service, or morning, afternoon or evening for part_of_day. Never save something you inferred.",
    schema: z.object({
      preference: preferenceKind,
      value: z.string().min(1).max(64).describe("staffId, serviceId, or morning / afternoon / evening"),
    }),
    handler: (args, context) => bookingAssistantService.rememberPreference(context, args),
  }),
  tool({
    name: "forget_preference",
    description: "Forget one of the customer's saved preferences when they ask you to.",
    schema: z.object({ preference: preferenceKind }),
    handler: (args, context) => bookingAssistantService.forgetPreference(context, args.preference),
  }),
  tool({
    name: "handoff_to_human",
    description:
      "Flag the chat for the business's staff when the customer asks for a person, is upset, or needs something you cannot do.",
    schema: z.object({ reason: z.string().min(3).max(500) }),
    handler: (args, context) => bookingAssistantService.handoffToHuman(context, args.reason),
  }),
];
