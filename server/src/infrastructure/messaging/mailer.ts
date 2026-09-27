import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** An iCalendar invite that mail clients offer to add to the calendar. */
  calendarEvent?: CalendarAttachment;
}

export interface CalendarAttachment {
  /** REQUEST adds or updates the event; CANCEL removes it. */
  method: "REQUEST" | "CANCEL";
  content: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  public constructor(url: string) {
    this.transport = nodemailer.createTransport(url);
  }

  public async send(message: EmailMessage): Promise<void> {
    const { calendarEvent, ...email } = message;

    await this.transport.sendMail({
      from: env.MAIL_FROM,
      ...email,
      ...(calendarEvent
        ? { icalEvent: { method: calendarEvent.method, filename: "invite.ics", content: calendarEvent.content } }
        : {}),
    });
  }
}

/**
 * Development stand-in: writes the email to the log so links can be
 * followed locally. Never used in production, where content could leak.
 */
class LogMailer implements Mailer {
  public send(message: EmailMessage): Promise<void> {
    if (env.NODE_ENV === "production") {
      logger.error({ to: message.to, subject: message.subject }, "SMTP_URL is not configured; email dropped");
    } else {
      logger.info({ email: message }, "Email (not sent: SMTP_URL is not configured)");
    }

    return Promise.resolve();
  }
}

export const mailer: Mailer = env.SMTP_URL ? new SmtpMailer(env.SMTP_URL) : new LogMailer();
