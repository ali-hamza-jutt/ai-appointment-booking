import type { PhoneNumberInput } from "../../auth/dto/auth.dto.js";

export type MessagingChannel = "SMS" | "WHATSAPP";

export interface MessagingNumberResponse {
  id: string;
  channel: MessagingChannel;
  /** E.164, for example +15550001111. */
  number: string;
  createdAt: Date;
}

export interface MessagingNumberListResponse {
  items: MessagingNumberResponse[];
  /** Set this as the "A message comes in" webhook of each number in Twilio. */
  webhookUrl: string;
}

export interface AddMessagingNumberRequest {
  channel: MessagingChannel;
  /** The Twilio number, or the WhatsApp sender's number. */
  number: PhoneNumberInput;
}

/** One incoming SMS or WhatsApp message, queued for the worker. */
export interface InboundMessageJobData {
  businessId: string;
  channel: MessagingChannel;
  /** As Twilio writes it, for example whatsapp:+447700900123. */
  from: string;
  to: string;
  body: string;
  messageSid: string;
  /** WhatsApp's display name for the sender, when it gives one. */
  profileName: string | null;
}

export interface MessagingNumberRecord {
  id: string;
  businessId: string;
  channel: string;
  address: string;
  createdAt: Date;
}
