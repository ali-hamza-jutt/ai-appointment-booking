import { logger } from "../../config/logger.js";
import { REALTIME_CONSTANTS } from "../../constants/app.constants.js";
import { realtimeBus } from "../../infrastructure/realtime/realtime-bus.js";
import type { BookingRealtimeEvent, ChatRealtimeEvent } from "./dto/chat-stream.dto.js";

export const chatChannels = {
  session: (sessionId: string) => `${REALTIME_CONSTANTS.SESSION_CHANNEL_PREFIX}:${sessionId}`,
  business: (businessId: string) => `${REALTIME_CONSTANTS.BUSINESS_CHANNEL_PREFIX}:${businessId}`,
};

/**
 * Tells the customer's other tabs and the business dashboard that a chat
 * changed. Called after the change is committed; a lost notice only delays
 * the refresh until the next poll, so failures are logged, not thrown.
 */
export function publishChatEvent(event: ChatRealtimeEvent): void {
  void Promise.all([
    realtimeBus.publish(chatChannels.session(event.sessionId), event),
    realtimeBus.publish(chatChannels.business(event.businessId), event),
  ]).catch((error: unknown) => {
    logger.warn({ err: error, type: event.type }, "Chat event could not be published");
  });
}

/** Tells the business dashboard that a booking changed. */
export async function publishBookingEvent(event: BookingRealtimeEvent): Promise<void> {
  try {
    await realtimeBus.publish(chatChannels.business(event.businessId), event);
  } catch (error) {
    logger.warn({ err: error, bookingId: event.bookingId }, "Booking event could not be published");
  }
}
