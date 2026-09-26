import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export interface SmsMessage {
  to: string;
  text: string;
}

export interface SmsSender {
  readonly isAvailable: boolean;
  send(message: SmsMessage): Promise<void>;
}

/**
 * No SMS provider is wired up yet (that arrives with notifications), so
 * codes are logged for local development and SMS is unavailable in production.
 */
class LogSmsSender implements SmsSender {
  public readonly isAvailable = env.NODE_ENV !== "production";

  public send(message: SmsMessage): Promise<void> {
    logger.info({ sms: message }, "SMS (not sent: no provider configured)");

    return Promise.resolve();
  }
}

export const smsSender: SmsSender = new LogSmsSender();
