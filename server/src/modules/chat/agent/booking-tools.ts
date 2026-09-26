import { z } from "zod";

import type { AgentTool } from "../../../integrations/ai/agent/agent.dto.js";
import type { ChatMessagePart } from "../dto/chat.dto.js";
import {
  bookingAssistantService,
  type AssistantContext,
} from "./booking-assistant.service.js";

type BookingTool = AgentTool<AssistantContext, ChatMessagePart, never>;

const uuid = z.uuid();
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const slotToken = z.string().min(10).describe("A slotToken exactly as returned by get_availability");

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
    name: "handoff_to_human",
    description:
      "Flag the chat for the business's staff when the customer asks for a person, is upset, or needs something you cannot do.",
    schema: z.object({ reason: z.string().min(3).max(500) }),
    handler: (args, context) => bookingAssistantService.handoffToHuman(context, args.reason),
  }),
];
