import type { BusinessSummaryResponse } from "@/generated/api/models";

export interface ActiveBusinessContextValue {
  activeBusiness: BusinessSummaryResponse | null;
  businesses: BusinessSummaryResponse[];
  error: Error | null;
  isLoading: boolean;
  retry: () => void;
  selectBusiness: (businessId: string) => void;
}
