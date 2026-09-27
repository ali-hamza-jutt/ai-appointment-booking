import type { BadgeTone } from "@/components/ui/badge";
import type { PaymentStatus, ServicePaymentMode } from "@/generated/api/models";

export const PAYMENT_UI_CONSTANTS = {
  STATUS_PRESENTATION: {
    PENDING: { label: "Awaiting payment", tone: "warning" },
    SUCCEEDED: { label: "Paid", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
    CANCELLED: { label: "Not paid", tone: "neutral" },
    PARTIALLY_REFUNDED: { label: "Partly refunded", tone: "brand" },
    REFUNDED: { label: "Refunded", tone: "neutral" },
  } satisfies Record<PaymentStatus, { label: string; tone: BadgeTone }>,
  MODE_OPTIONS: [
    { value: "NONE", label: "Pay at the appointment" },
    { value: "DEPOSIT", label: "Deposit when booking" },
    { value: "FULL", label: "Full price when booking" },
  ] satisfies Array<{ value: ServicePaymentMode; label: string }>,
  /** While a returning customer waits for Stripe's confirmation. */
  CONFIRMATION_POLL_MS: 2_000,
} as const;
