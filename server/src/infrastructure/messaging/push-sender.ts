import webpush from "web-push";

import { env } from "../../config/env.js";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is clicked. */
  url: string;
}

/** gone: the browser unsubscribed (or the subscription expired), so it should be forgotten. */
export type PushResult = "sent" | "gone";

export interface PushSender {
  readonly isAvailable: boolean;
  /** The key browsers subscribe with; null when push is off. */
  readonly publicKey: string | null;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

/** Web Push with VAPID; payloads are encrypted for the browser by the library. */
class WebPushSender implements PushSender {
  public readonly isAvailable = true;

  public constructor(
    public readonly publicKey: string,
    private readonly privateKey: string,
    private readonly subject: string,
  ) {}

  public async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60, vapidDetails: { subject: this.subject, publicKey: this.publicKey, privateKey: this.privateKey } },
      );

      return "sent";
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;

      if (status === 404 || status === 410) return "gone";
      throw error;
    }
  }
}

class DisabledPushSender implements PushSender {
  public readonly isAvailable = false;
  public readonly publicKey = null;

  public send(): Promise<PushResult> {
    return Promise.resolve("gone");
  }
}

export const pushSender: PushSender =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
    ? new WebPushSender(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT)
    : new DisabledPushSender();
