import { describe, expect, it } from "vitest";

import { NOTIFICATION_CONSTANTS } from "../../src/constants/app.constants.js";
import {
  DEFAULT_TEMPLATES,
  findTemplateProblems,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
  renderTemplate,
  type TemplateValues,
} from "../../src/modules/notifications/notification-templates.js";

const values: TemplateValues = {
  customerName: "Ayesha",
  businessName: "Glow Salon and Spa of Greater Manchester",
  serviceName: "Colour, cut and blow-dry for long hair",
  staffName: "Sana",
  date: "Wed, Oct 14",
  time: "10:30 AM",
  timeZone: "Europe/London",
  location: "Main studio, 12 High Street, Manchester",
  link: "https://bookwise.example/appointments/0c1b2a3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  heldUntil: "10:45 AM",
};

describe("notification templates", () => {
  it("fills placeholders, with or without spaces inside the braces", () => {
    expect(renderTemplate("Hi {{customerName}}, see you {{ date }} at {{time}}.", values)).toBe(
      "Hi Ayesha, see you Wed, Oct 14 at 10:30 AM.",
    );
  });

  it("reports unknown placeholders and stray braces", () => {
    expect(findTemplateProblems("Hi {{customerName}}")).toEqual([]);
    expect(findTemplateProblems("Hi {{firstName}}")).toEqual(["Unknown placeholder {{firstName}}"]);
    expect(findTemplateProblems("Hi {{customerName}")).toEqual(["Placeholders must look like {{serviceName}}"]);
  });

  it("ships valid built-in wording for every message", () => {
    for (const channel of NOTIFICATION_CHANNELS) {
      for (const kind of NOTIFICATION_KINDS) {
        const template = DEFAULT_TEMPLATES[channel][kind];

        expect(findTemplateProblems(`${template.subject ?? ""} ${template.body}`)).toEqual([]);
        expect(Boolean(template.subject)).toBe(channel === "EMAIL");
      }
    }
  });

  it("keeps built-in texts within three SMS segments even with long names", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(renderTemplate(DEFAULT_TEMPLATES.SMS[kind].body, values).length).toBeLessThanOrEqual(
        NOTIFICATION_CONSTANTS.MAX_SMS_BODY_LENGTH,
      );
    }
  });
});
