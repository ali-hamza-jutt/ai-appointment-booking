/** Accounts made for people who only text or WhatsApp a business have a stand-in email that never receives mail. */
const PLACEHOLDER_SUFFIX = "@phone.bookwise.invalid";

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(PLACEHOLDER_SUFFIX));
}
