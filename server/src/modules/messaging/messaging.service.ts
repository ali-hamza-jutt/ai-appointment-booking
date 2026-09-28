import { createHash } from "node:crypto";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  MESSAGING_CONSTANTS,
  VALIDATION_PATTERNS,
} from "../../constants/app.constants.js";
import { smsSender, type SmsSender } from "../../infrastructure/messaging/sms-sender.js";
import { AppError } from "../../middleware/app-error.js";
import { isUniqueConstraintError } from "../../utils/database.js";
import { placeholderEmailFor } from "../../utils/placeholder-email.js";
import { authDal } from "../auth/dal/auth.dal.js";
import { normalizePhoneNumber } from "../auth/phone-auth.service.js";
import { chatOrchestrationService, type ChatOrchestrationService } from "../chat/chat-orchestration.service.js";
import { parseStoredParts } from "../chat/chat-parts.schema.js";
import { chatService } from "../chat/chat.service.js";
import { chatDal } from "../chat/dal/chat.dal.js";
import { customerProfileDal } from "../customers/dal/customer-profile.dal.js";
import { publicBookingDal } from "../public-booking/dal/public-booking.dal.js";
import { interpretReply, renderReply, type TextChannel } from "./channel-renderer.js";
import { messagingDal } from "./dal/messaging.dal.js";
import type {
  InboundMessageJobData,
  MessagingChannel,
  MessagingNumberListResponse,
  MessagingNumberRecord,
  MessagingNumberResponse,
} from "./dto/messaging.dto.js";

const { WHATSAPP_PREFIX } = MESSAGING_CONSTANTS;

/** Refusals worded for someone texting, where the web shows a form or button instead. */
const TEXT_REFUSALS: Readonly<Record<string, string>> = {
  [ERROR_CODES.CHAT_BOOKING_CONTEXT_INCOMPLETE]:
    "That time isn't held for you any more. Tell me when you'd like to come and I'll find another.",
  [ERROR_CODES.BOOKING_HOLD_EXPIRED]:
    "That time isn't held for you any more. Tell me when you'd like to come and I'll find another.",
};

/** Twilio's message id as a stable UUID, so a retried message is the same chat message. */
export function messageIdFor(messageSid: string): string {
  const hex = createHash("sha256").update(`twilio:${messageSid}`).digest("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function toResponse(record: MessagingNumberRecord): MessagingNumberResponse {
  return {
    id: record.id,
    channel: record.channel as MessagingChannel,
    number: record.address.replace(WHATSAPP_PREFIX, ""),
    createdAt: record.createdAt,
  };
}

/**
 * SMS and WhatsApp as booking channels. A message to a business's number
 * becomes a chat turn for the customer behind the sending number; the
 * assistant's reply goes back as text, its cards written as numbered options.
 */
export class MessagingService {
  public constructor(
    private readonly orchestration: ChatOrchestrationService = chatOrchestrationService,
    private readonly sender: SmsSender = smsSender,
  ) {}

  public async listNumbers(businessId: string): Promise<MessagingNumberListResponse> {
    const numbers = await messagingDal.listNumbers(businessId);

    return {
      items: numbers.map(toResponse),
      webhookUrl: new URL(MESSAGING_CONSTANTS.INBOUND_PATH, env.API_PUBLIC_URL).toString(),
    };
  }

  public async addNumber(businessId: string, channel: MessagingChannel, numberInput: string): Promise<MessagingNumberResponse> {
    const number = normalizePhoneNumber(numberInput);
    const address = channel === "WHATSAPP" ? `${WHATSAPP_PREFIX}${number}` : number;
    const existing = await messagingDal.findByAddress(address);

    if (existing?.businessId === businessId) return toResponse(existing);
    if (existing) this.throwTaken();

    try {
      return toResponse(await messagingDal.createNumber(businessId, channel, address));
    } catch (error) {
      if (isUniqueConstraintError(error)) this.throwTaken();
      throw error;
    }
  }

  public async removeNumber(businessId: string, numberId: string): Promise<void> {
    const removed = VALIDATION_PATTERNS.UUID.test(numberId) && (await messagingDal.removeNumber(businessId, numberId));

    if (!removed) {
      throw new AppError(404, ERROR_CODES.MESSAGING_NUMBER_NOT_FOUND, ERROR_MESSAGES.MESSAGING_NUMBER_NOT_FOUND);
    }
  }

  /**
   * Runs one incoming message: finds or creates the customer by their
   * number, continues their chat with the business, and texts the reply.
   * Safe to retry: the message id makes a repeat the same chat message.
   */
  public async handleInbound(job: InboundMessageJobData, now: Date = new Date()): Promise<void> {
    const business = await messagingDal.findBusiness(job.businessId);
    let phone: string;

    try {
      phone = normalizePhoneNumber(job.from.replace(WHATSAPP_PREFIX, ""));
    } catch {
      logger.warn({ businessId: job.businessId }, "Ignored a message from an address that isn't a phone number");
      return;
    }

    if (!business) return;

    const userId = await this.resolveUser(phone, job.profileName, now);
    const customerId = await customerProfileDal.resolveCustomerIdForUser(business.id, userId);

    if (customerId) await publicBookingDal.setCustomerPhoneIfMissing(business.id, customerId, phone);

    const session = await chatService.createSession(userId, { businessSlug: business.slug }, job.channel);

    await chatDal.setChannel(business.id, session.id, job.channel, { customerAddress: job.from, businessAddress: job.to });

    const action = interpretReply(job.body, parseStoredParts(await messagingDal.lastAssistantParts(session.id)));
    const content = job.body.trim().slice(0, MESSAGING_CONSTANTS.MAX_INBOUND_LENGTH) || "(sent an attachment)";
    let reply: string;

    try {
      // "Yes" to a held time books it, as the Confirm button does on the web.
      const message =
        action?.type === "confirm_booking"
          ? (await this.orchestration.confirmBooking(userId, session.id)).assistantMessage
          : (
              await this.orchestration.processMessage(userId, session.id, {
                clientMessageId: messageIdFor(job.messageSid),
                content,
                timeZone: business.timeZone,
                ...(action ? { action } : {}),
              })
            ).assistantMessage;

      reply = renderReply(message.content, message.structuredData?.parts ?? [], job.channel);
    } catch (error) {
      // A refusal (the time was just taken, too many messages) is worth telling them; retrying won't help.
      if (!(error instanceof AppError) || error.statusCode >= 500) throw error;

      reply = renderReply(TEXT_REFUSALS[error.code] ?? error.message, [], job.channel);
    }

    await this.sender.send({ to: job.from, from: job.to, text: reply });
  }

  /** Sends a staff member's inbox reply to a customer chatting by SMS or WhatsApp. */
  public async relayStaffReply(
    session: { channel: string; customerAddress: string | null; businessAddress: string | null },
    staffName: string,
    businessName: string,
    text: string,
  ): Promise<void> {
    if ((session.channel !== "SMS" && session.channel !== "WHATSAPP") || !session.customerAddress || !session.businessAddress) {
      return;
    }

    await this.sender.send({
      to: session.customerAddress,
      from: session.businessAddress,
      text: renderReply(`${staffName} from ${businessName}: ${text}`, [], session.channel as TextChannel),
    });
  }

  /** The account behind a number, made the first time it writes in. */
  private async resolveUser(phone: string, profileName: string | null, now: Date): Promise<string> {
    const existing = await authDal.findUserByPhone(phone);

    if (existing) return existing.id;

    const name = profileName?.trim().slice(0, 80);
    const fullName = name && name.length >= 2 ? name : `Customer ${phone.slice(-4)}`;

    try {
      return (await messagingDal.createPhoneUser(phone, fullName, placeholderEmailFor(phone), now)).id;
    } catch (error) {
      // Two messages from a new number raced; the other one made the account.
      const winner = isUniqueConstraintError(error) ? await authDal.findUserByPhone(phone) : null;

      if (!winner) throw error;

      return winner.id;
    }
  }

  private throwTaken(): never {
    throw new AppError(409, ERROR_CODES.MESSAGING_NUMBER_TAKEN, ERROR_MESSAGES.MESSAGING_NUMBER_TAKEN);
  }
}

export const messagingService = new MessagingService();
