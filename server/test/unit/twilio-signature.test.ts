import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  isValidTwilioSignature,
  twilioSignature,
} from "../../src/infrastructure/messaging/twilio-signature.js";
import { toE164 } from "../../src/utils/phone.js";

const URL = "https://api.bookwise.example/api/webhooks/twilio/sms-status";
const TOKEN = "twilio-auth-token";
const params = { MessageStatus: "delivered", MessageSid: "SM123", AccountSid: "AC456" };

describe("Twilio signatures", () => {
  it("signs the URL followed by the parameters sorted by name", () => {
    const expected = createHmac("sha1", TOKEN)
      .update(`${URL}AccountSidAC456MessageSidSM123MessageStatusdelivered`)
      .digest("base64");

    expect(twilioSignature(TOKEN, URL, params)).toBe(expected);
  });

  it("accepts a genuine request and rejects a tampered or unsigned one", () => {
    const signature = twilioSignature(TOKEN, URL, params);

    expect(isValidTwilioSignature(TOKEN, URL, params, signature)).toBe(true);
    expect(isValidTwilioSignature(TOKEN, URL, { ...params, MessageStatus: "failed" }, signature)).toBe(false);
    expect(isValidTwilioSignature("other-token", URL, params, signature)).toBe(false);
    expect(isValidTwilioSignature(TOKEN, URL, params, undefined)).toBe(false);
  });
});

describe("toE164", () => {
  it("strips formatting from international numbers and refuses local ones", () => {
    expect(toE164("+44 7700 900123")).toBe("+447700900123");
    expect(toE164("+1 (415) 555-0100")).toBe("+14155550100");
    expect(toE164("07700 900123")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});
