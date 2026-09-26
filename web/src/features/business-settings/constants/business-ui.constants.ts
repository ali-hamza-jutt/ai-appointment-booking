import type { ComponentType } from "react";

import type { BadgeTone } from "@/components/ui/badge";
import {
  BookIcon,
  BriefcaseIcon,
  DumbbellIcon,
  LeafIcon,
  PawIcon,
  ScissorsIcon,
  StethoscopeIcon,
  type IconProps,
} from "@/components/ui/icons";
import type {
  BusinessVertical,
  InvitableMembershipRole,
  MembershipRole,
} from "@/generated/api/models";

export const BUSINESS_UI_CONSTANTS = {
  ACTIVE_BUSINESS_STORAGE_KEY: "bookwise.active-business",
  DEFAULT_CURRENCY: "USD",
  CURRENCY_OPTIONS: [
    { value: "USD", label: "US dollar (USD)" },
    { value: "EUR", label: "Euro (EUR)" },
    { value: "GBP", label: "British pound (GBP)" },
    { value: "PKR", label: "Pakistani rupee (PKR)" },
    { value: "INR", label: "Indian rupee (INR)" },
    { value: "AED", label: "UAE dirham (AED)" },
    { value: "SAR", label: "Saudi riyal (SAR)" },
    { value: "CAD", label: "Canadian dollar (CAD)" },
    { value: "AUD", label: "Australian dollar (AUD)" },
  ],
} as const;

export const VERTICAL_ICONS: Record<BusinessVertical, ComponentType<IconProps>> = {
  SALON: ScissorsIcon,
  CLINIC: StethoscopeIcon,
  CONSULTANT: BriefcaseIcon,
  SPA_WELLNESS: LeafIcon,
  FITNESS_STUDIO: DumbbellIcon,
  TUTORING: BookIcon,
  PET_GROOMING: PawIcon,
};

export const ROLE_LABELS: Record<MembershipRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  STAFF: "Staff",
};

export const ROLE_TONES: Record<MembershipRole, BadgeTone> = {
  OWNER: "brand",
  MANAGER: "success",
  STAFF: "neutral",
};

export const INVITABLE_ROLE_OPTIONS: ReadonlyArray<{
  value: InvitableMembershipRole;
  label: string;
  description: string;
}> = [
  {
    value: "MANAGER",
    label: "Manager",
    description: "Manages settings, services, staff and all bookings.",
  },
  {
    value: "STAFF",
    label: "Staff",
    description: "Sees the business and manages bookings and customers.",
  },
];

export interface PolicyFieldDefinition {
  key:
    | "bookingWindowDays"
    | "minimumNoticeMinutes"
    | "slotStepMinutes"
    | "cancellationWindowHours"
    | "rescheduleLimit"
    | "holdMinutes"
    | "noShowGraceMinutes";
  label: string;
  hint: string;
  min: number;
  max: number;
}

export const POLICY_FIELDS: ReadonlyArray<PolicyFieldDefinition> = [
  {
    key: "bookingWindowDays",
    label: "Booking window (days)",
    hint: "How far ahead customers can book.",
    min: 1,
    max: 365,
  },
  {
    key: "minimumNoticeMinutes",
    label: "Minimum notice (minutes)",
    hint: "Shortest time between booking and start.",
    min: 0,
    max: 10_080,
  },
  {
    key: "slotStepMinutes",
    label: "Slot interval (minutes)",
    hint: "Spacing between offered start times.",
    min: 5,
    max: 120,
  },
  {
    key: "cancellationWindowHours",
    label: "Cancellation window (hours)",
    hint: "Customers cannot cancel closer to the start than this.",
    min: 0,
    max: 720,
  },
  {
    key: "rescheduleLimit",
    label: "Reschedule limit",
    hint: "Maximum times a booking can be moved.",
    min: 0,
    max: 10,
  },
  {
    key: "holdMinutes",
    label: "Slot hold (minutes)",
    hint: "How long a chosen slot is reserved before confirmation.",
    min: 2,
    max: 60,
  },
  {
    key: "noShowGraceMinutes",
    label: "No-show grace period (minutes)",
    hint: "Minutes after start before an unattended booking is a no-show.",
    min: 0,
    max: 240,
  },
];
