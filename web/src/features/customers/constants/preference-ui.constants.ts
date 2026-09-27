import type {
  CustomerPreferenceKey,
  CustomerPreferenceSource,
} from "@/generated/api/models";

export const PREFERENCE_UI_CONSTANTS = {
  KEY_LABELS: {
    PREFERRED_STAFF: "Preferred provider",
    USUAL_SERVICE: "Usual service",
    PREFERRED_PART_OF_DAY: "Usual time of day",
  } satisfies Record<CustomerPreferenceKey, string>,
  /** How the customer sees where a preference came from. */
  SOURCE_LABELS: {
    CUSTOMER: "You asked us to remember",
    BOOKING_HISTORY: "From your past visits",
  } satisfies Record<CustomerPreferenceSource, string>,
  /** The same, as the business's staff see it. */
  STAFF_SOURCE_LABELS: {
    CUSTOMER: "Customer asked",
    BOOKING_HISTORY: "From visit history",
  } satisfies Record<CustomerPreferenceSource, string>,
} as const;
