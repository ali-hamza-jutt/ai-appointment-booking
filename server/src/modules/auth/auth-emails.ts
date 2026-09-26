import { env } from "../../config/env.js";
import type { EmailMessage } from "../../infrastructure/messaging/mailer.js";

function webLink(path: string, token: string): string {
  const url = new URL(path, env.WEB_ORIGIN);

  url.searchParams.set("token", token);

  return url.toString();
}

export function verificationEmail(to: string, fullName: string, token: string, hours: number): EmailMessage {
  return {
    to,
    subject: "Confirm your BookWise email",
    text: [
      `Hi ${fullName},`,
      "",
      "Confirm your email address to finish setting up your BookWise account:",
      webLink("/verify-email", token),
      "",
      `The link works for ${hours} hours. If you didn't create an account, you can ignore this email.`,
    ].join("\n"),
  };
}

export function passwordResetEmail(to: string, fullName: string, token: string, minutes: number): EmailMessage {
  return {
    to,
    subject: "Reset your BookWise password",
    text: [
      `Hi ${fullName},`,
      "",
      "Use this link to choose a new password:",
      webLink("/reset-password", token),
      "",
      `The link works for ${minutes} minutes and signs you out everywhere else. If you didn't ask for this, you can ignore this email.`,
    ].join("\n"),
  };
}
