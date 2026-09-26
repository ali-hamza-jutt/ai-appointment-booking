"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { CUSTOMER_UI_CONSTANTS } from "@/features/customers/constants/customer-ui.constants";
import {
  getListCustomersQueryKey,
  listCustomers,
} from "@/generated/api/customers/customers";
import type {
  CustomerListResponse,
  ListCustomersParams,
} from "@/generated/api/models";

export function useCustomers(businessId: string, search: string) {
  const baseParams: ListCustomersParams = {
    limit: CUSTOMER_UI_CONSTANTS.PAGE_SIZE,
    ...(search ? { search } : {}),
  };

  return useInfiniteQuery({
    getNextPageParam: (lastPage: CustomerListResponse) => lastPage.nextCursor ?? null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }): Promise<CustomerListResponse> =>
      listCustomers(
        businessId,
        { ...baseParams, ...(pageParam ? { cursor: pageParam } : {}) },
        { signal },
      ),
    queryKey: [...getListCustomersQueryKey(businessId, baseParams), "infinite"] as const,
  });
}
