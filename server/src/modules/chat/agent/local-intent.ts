import { AI_CONSTANTS } from "../../../constants/app.constants.js";

export type LocalIntent = "GREETING" | "BOOKING_HELP";

/** Messages answered without the AI: a bare greeting or "what can you do". */
export function classifyLocalIntent(message: string): LocalIntent | null {
  if (AI_CONSTANTS.PURE_GREETING_PATTERN.test(message)) return "GREETING";
  if (AI_CONSTANTS.BOOKING_HELP_PATTERN.test(message)) return "BOOKING_HELP";

  return null;
}
