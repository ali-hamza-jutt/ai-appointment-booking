import type {
  NotificationChannel,
  NotificationKind,
  NotificationTemplateVariable,
} from "./dto/notification.dto.js";

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ["EMAIL", "SMS"];

export const NOTIFICATION_KINDS: NotificationKind[] = [
  "BOOKING_CONFIRMED",
  "BOOKING_REQUESTED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_REMINDER",
  "WAITLIST_OFFER",
];

export const TEMPLATE_VARIABLES = [
  { name: "customerName", description: "The customer's first name" },
  { name: "businessName", description: "Your business name" },
  { name: "serviceName", description: "The booked service" },
  { name: "staffName", description: "The provider, or \"our team\" when none is assigned" },
  { name: "date", description: "The appointment date, for example Tue, Oct 6" },
  { name: "time", description: "The start time, for example 10:00 AM" },
  { name: "timeZone", description: "The time zone the date and time are in" },
  { name: "location", description: "Where the appointment is" },
  { name: "link", description: "Where the customer can view, move or cancel it" },
  { name: "heldUntil", description: "When a time held for a waitlisted customer is released (waitlist offers)" },
] as const satisfies readonly NotificationTemplateVariable[];

export type TemplateVariableName = (typeof TEMPLATE_VARIABLES)[number]["name"];

export type TemplateValues = Record<TemplateVariableName, string>;

interface DefaultTemplate {
  subject: string | null;
  body: string;
}

const EMAIL_SIGN_OFF = "\n\nView, move or cancel: {{link}}\n\n{{businessName}}";

/** The wording used until a business writes its own. */
export const DEFAULT_TEMPLATES: Record<NotificationChannel, Record<NotificationKind, DefaultTemplate>> = {
  EMAIL: {
    BOOKING_CONFIRMED: {
      subject: "Booked: {{serviceName}} on {{date}} at {{time}}",
      body: `Hi {{customerName}},\n\nYour {{serviceName}} with {{staffName}} is booked for {{date}} at {{time}} ({{timeZone}}).\n\nWhere: {{location}}\n\nThe calendar invite is attached.${EMAIL_SIGN_OFF}`,
    },
    BOOKING_REQUESTED: {
      subject: "Request received: {{serviceName}} on {{date}}",
      body: `Hi {{customerName}},\n\nWe've received your request for {{serviceName}} on {{date}} at {{time}} ({{timeZone}}). We'll email you as soon as it's confirmed.${EMAIL_SIGN_OFF}`,
    },
    BOOKING_RESCHEDULED: {
      subject: "Moved: {{serviceName}} is now on {{date}} at {{time}}",
      body: `Hi {{customerName}},\n\nYour {{serviceName}} with {{staffName}} has moved to {{date}} at {{time}} ({{timeZone}}).\n\nWhere: {{location}}\n\nThe updated calendar invite is attached.${EMAIL_SIGN_OFF}`,
    },
    BOOKING_CANCELLED: {
      subject: "Cancelled: {{serviceName}} on {{date}}",
      body: "Hi {{customerName}},\n\nYour {{serviceName}} on {{date}} at {{time}} ({{timeZone}}) has been cancelled.\n\nBook again any time: {{link}}\n\n{{businessName}}",
    },
    BOOKING_REMINDER: {
      subject: "Reminder: {{serviceName}} on {{date}} at {{time}}",
      body: `Hi {{customerName}},\n\nA reminder that your {{serviceName}} with {{staffName}} is on {{date}} at {{time}} ({{timeZone}}).\n\nWhere: {{location}}${EMAIL_SIGN_OFF}`,
    },
    WAITLIST_OFFER: {
      subject: "A time opened up: {{serviceName}} on {{date}} at {{time}}",
      body: "Hi {{customerName}},\n\nA time you were waiting for has opened up. {{serviceName}} with {{staffName}} on {{date}} at {{time}} ({{timeZone}}) is held for you until {{heldUntil}}.\n\nConfirm it here before then: {{link}}\n\nIf you don't, it goes to the next person on the waitlist.\n\n{{businessName}}",
    },
  },
  SMS: {
    BOOKING_CONFIRMED: {
      subject: null,
      body: "{{businessName}}: your {{serviceName}} is booked for {{date}} at {{time}}. Manage it: {{link}}",
    },
    BOOKING_REQUESTED: {
      subject: null,
      body: "{{businessName}} received your request for {{serviceName}} on {{date}} at {{time}}. We'll confirm soon.",
    },
    BOOKING_RESCHEDULED: {
      subject: null,
      body: "{{businessName}}: your {{serviceName}} has moved to {{date}} at {{time}}. Manage it: {{link}}",
    },
    BOOKING_CANCELLED: {
      subject: null,
      body: "{{businessName}}: your {{serviceName}} on {{date}} at {{time}} is cancelled.",
    },
    BOOKING_REMINDER: {
      subject: null,
      body: "Reminder from {{businessName}}: {{serviceName}} with {{staffName}} on {{date}} at {{time}}. Manage it: {{link}}",
    },
    WAITLIST_OFFER: {
      subject: null,
      body: "{{businessName}}: {{serviceName}} on {{date}} at {{time}} opened up and is held for you until {{heldUntil}}. Confirm: {{link}}",
    },
  },
};

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;
const KNOWN = new Set<string>(TEMPLATE_VARIABLES.map((variable) => variable.name));

/**
 * Problems with a template's placeholders: unknown names, or braces that
 * don't form a placeholder. Empty when it is fine.
 */
export function findTemplateProblems(text: string): string[] {
  const problems: string[] = [];

  for (const match of text.matchAll(PLACEHOLDER)) {
    const name = match[1] ?? "";

    if (!KNOWN.has(name)) problems.push(`Unknown placeholder {{${name}}}`);
  }

  const leftover = text.replace(PLACEHOLDER, "");

  if (leftover.includes("{{") || leftover.includes("}}")) {
    problems.push("Placeholders must look like {{serviceName}}");
  }

  return problems;
}

/** Fills {{name}} placeholders. There is no logic: values are plain text. */
export function renderTemplate(text: string, values: TemplateValues): string {
  return text.replace(PLACEHOLDER, (_match, name: string) =>
    KNOWN.has(name) ? values[name as TemplateVariableName] : "",
  );
}
