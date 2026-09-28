import { MESSAGING_CONSTANTS } from "../constants/app.constants.js";

const SUFFIX = `@${MESSAGING_CONSTANTS.PLACEHOLDER_EMAIL_DOMAIN}`;

/** The stand-in address of an account made for someone who has only texted. */
export function placeholderEmailFor(phone: string): string {
  return `${phone.replace(/\D/g, "")}${SUFFIX}`;
}

/** True for stand-in addresses, which must never be emailed or shown as contact details. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(SUFFIX));
}
