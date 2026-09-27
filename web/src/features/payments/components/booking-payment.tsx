"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { PAYMENT_UI_CONSTANTS } from "@/features/payments/constants/payment-ui.constants";
import { getListBookingsQueryKey } from "@/generated/api/bookings/bookings";
import type { BookingResponse } from "@/generated/api/models";
import { useRefundBooking } from "@/generated/api/payments/payments";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";
import { formatMoney, majorInputToMinor, minorToMajorInput } from "@/lib/utils/money";

/** What the customer paid for a booking, and a refund for staff who manage the business. */
export function BookingPayment({
  booking,
  businessId,
  canRefund,
}: {
  booking: BookingResponse;
  businessId: string;
  canRefund: boolean;
}) {
  const queryClient = useQueryClient();
  const payment = booking.payment;
  const [isRefunding, setIsRefunding] = useState(false);
  const [amount, setAmount] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const refundMutation = useRefundBooking({
    mutation: {
      onSuccess: () => {
        setIsRefunding(false);
        void queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey(businessId) });
      },
    },
  });

  if (!payment) return null;

  const status = PAYMENT_UI_CONSTANTS.STATUS_PRESENTATION[payment.status];
  const refundable = payment.amountMinor - payment.refundedMinor;
  const paid = payment.status === "SUCCEEDED" || payment.status === "PARTIALLY_REFUNDED";

  function submitRefund() {
    if (!payment) return;

    const minor = amount.trim() ? majorInputToMinor(amount, payment.currency) : refundable;

    if (minor === null || minor < 1 || minor > refundable) {
      setInputError(`Enter an amount up to ${formatMoney(refundable, payment.currency)}.`);
      return;
    }

    setInputError(null);
    refundMutation.mutate({ businessId, bookingId: booking.id, data: { amountMinor: minor } });
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Payment</h3>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-ink">
          {payment.kind === "DEPOSIT" ? "Deposit" : "Full payment"} {formatMoney(payment.amountMinor, payment.currency)}
          {payment.refundedMinor > 0 ? (
            <span className="text-muted"> · {formatMoney(payment.refundedMinor, payment.currency)} refunded</span>
          ) : null}
        </span>
        <div className="flex items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {canRefund && paid && refundable > 0 && !isRefunding ? (
            <Button onClick={() => setIsRefunding(true)} size="sm" variant="ghost">
              Refund
            </Button>
          ) : null}
        </div>
      </div>

      {isRefunding ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
          <TextField
            error={inputError ?? getApiFieldError(refundMutation.error, "amountMinor")}
            hint={`Leave empty to refund everything left (${formatMoney(refundable, payment.currency)}).`}
            id="refund-amount"
            inputMode="decimal"
            label={`Refund amount (${payment.currency})`}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={minorToMajorInput(refundable, payment.currency)}
            value={amount}
          />
          {refundMutation.error && !getApiFieldError(refundMutation.error, "amountMinor") ? (
            <Alert tone="danger">{getApiErrorMessage(refundMutation.error, "The refund could not be made.")}</Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setIsRefunding(false)} size="sm" variant="secondary">
              Back
            </Button>
            <Button isLoading={refundMutation.isPending} onClick={submitRefund} size="sm" variant="danger">
              Refund
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
