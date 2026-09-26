"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { BUSINESS_UI_CONSTANTS } from "@/features/business-settings/constants/business-ui.constants";
import type { ActiveBusinessContextValue } from "@/features/business-settings/types/active-business";
import { useListMyBusinesses } from "@/generated/api/businesses/businesses";
import {
  readStoredValue,
  writeStoredValue,
} from "@/lib/utils/browser-storage";

const ActiveBusinessContext = createContext<ActiveBusinessContextValue | null>(null);

export function ActiveBusinessProvider({ children }: { children: ReactNode }) {
  const businessesQuery = useListMyBusinesses();
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : readStoredValue(BUSINESS_UI_CONSTANTS.ACTIVE_BUSINESS_STORAGE_KEY),
  );
  const businesses = useMemo(
    () => businessesQuery.data?.items ?? [],
    [businessesQuery.data],
  );
  const activeBusiness =
    businesses.find((business) => business.id === selectedBusinessId) ??
    businesses[0] ??
    null;

  const selectBusiness = useCallback((businessId: string) => {
    setSelectedBusinessId(businessId);
    writeStoredValue(BUSINESS_UI_CONSTANTS.ACTIVE_BUSINESS_STORAGE_KEY, businessId);
  }, []);

  const { refetch } = businessesQuery;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const value = useMemo<ActiveBusinessContextValue>(
    () => ({
      activeBusiness,
      businesses,
      error: businessesQuery.error,
      isLoading: businessesQuery.isPending,
      retry,
      selectBusiness,
    }),
    [
      activeBusiness,
      businesses,
      businessesQuery.error,
      businessesQuery.isPending,
      retry,
      selectBusiness,
    ],
  );

  return (
    <ActiveBusinessContext.Provider value={value}>
      {children}
    </ActiveBusinessContext.Provider>
  );
}

export function useActiveBusiness() {
  const context = useContext(ActiveBusinessContext);

  if (!context) {
    throw new Error("useActiveBusiness must be used inside ActiveBusinessProvider");
  }

  return context;
}
