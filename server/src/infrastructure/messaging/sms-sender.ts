import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { NOTIFICATION_CONSTANTS } from "../../constants/app.constants.js";

export interface SmsMessage {
  /** E.164, for example +447700900123. */
  to: string;
  text: string;
  /** Where the provider reports delivery status. */
  statusCallback?: string;
}

export interface SmsReceipt {
  providerMessageId: string;
}

export interface SmsSender {
  readonly isAvailable: boolean;
  /** Resolves with the provider's message id when there is one. */
  send(message: SmsMessage): Promise<SmsReceipt | undefined>;
}

/** A send the provider refused. `retryable` says whether trying again could help. */
export class SmsProviderError extends Error {
  public constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "SmsProviderError";
  }
}

/** Sends through Twilio's Messages API. */
class TwilioSmsSender implements SmsSender {
  public readonly isAvailable = true;

  public constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  public async send(message: SmsMessage): Promise<SmsReceipt> {
    const body = new URLSearchParams({
      To: message.to,
      Body: message.text,
      ...(this.from.startsWith("MG") ? { MessagingServiceSid: this.from } : { From: this.from }),
      ...(message.statusCallback ? { StatusCallback: message.statusCallback } : {}),
    });
    let response: Response;

    try {
      response = await fetch(
        `${NOTIFICATION_CONSTANTS.TWILIO_API_URL}/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
          signal: AbortSignal.timeout(NOTIFICATION_CONSTANTS.SMS_REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw new SmsProviderError(
        error instanceof Error ? `Twilio request failed: ${error.message}` : "Twilio request failed",
        true,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };

    if (!response.ok || !payload.sid) {
      throw new SmsProviderError(
        payload.message ?? `Twilio returned ${response.status}`,
        response.status === 429 || response.status >= 500,
        String(payload.code ?? response.status),
      );
    }

    return { providerMessageId: payload.sid };
  }
}

/**
 * Without Twilio credentials, messages are logged for local development
 * and SMS is unavailable in production.
 */
class LogSmsSender implements SmsSender {
  public readonly isAvailable = env.NODE_ENV !== "production";

  public send(message: SmsMessage): Promise<undefined> {
    logger.info({ sms: { to: message.to, text: message.text } }, "SMS (not sent: no provider configured)");

    return Promise.resolve(undefined);
  }
}

export const smsSender: SmsSender =
  env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM
    ? new TwilioSmsSender(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM)
    : new LogSmsSender();
