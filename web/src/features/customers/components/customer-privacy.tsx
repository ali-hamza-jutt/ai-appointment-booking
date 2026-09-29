"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { downloadJson } from "@/features/privacy/download-json";
import { exportCustomerData, getListCustomersQueryKey, useEraseCustomer } from "@/generated/api/customers/customers";
import { getApiErrorMessage } from "@/lib/api/api-error";

/** Data requests for one customer: a copy of everything held about them, or erasing it. */
export function CustomerPrivacy({
  businessId,
  customerId,
  onErased,
}: {
  businessId: string;
  customerId: string;
  onErased: () => void;
}) {
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const eraseMutation = useEraseCustomer({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey(businessId) });
        onErased();
      },
    },
  });

  async function exportData() {
    setIsExporting(true);
    setExportError(null);

    try {
      downloadJson(`customer-${customerId}.json`, await exportCustomerData(businessId, customerId));
    } catch (error) {
      setExportError(error);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div>
        <h4 className="text-sm font-semibold text-ink">Customer data</h4>
        <p className="mt-1 text-sm text-muted">
          For a customer&apos;s data request: download everything held about them, or erase it. Erasing keeps their past
          bookings as anonymous records and can&apos;t be undone.
        </p>
      </div>
      {exportError || eraseMutation.error ? (
        <Alert tone="danger">
          {getApiErrorMessage(exportError ?? eraseMutation.error, "That didn't work. Only owners and managers can do this.")}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button isLoading={isExporting} onClick={() => void exportData()} size="sm" variant="secondary">
          Export data
        </Button>
        {isConfirming ? (
          <>
            <Button
              isLoading={eraseMutation.isPending}
              onClick={() => eraseMutation.mutate({ businessId, customerId })}
              size="sm"
              variant="danger"
            >
              Erase for good
            </Button>
            <Button onClick={() => setIsConfirming(false)} size="sm" variant="ghost">
              Keep
            </Button>
          </>
        ) : (
          <Button onClick={() => setIsConfirming(true)} size="sm" variant="ghost">
            Erase customer data
          </Button>
        )}
      </div>
    </section>
  );
}
