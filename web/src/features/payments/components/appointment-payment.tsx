"use client";

import { useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { PAYMENT_UI_CONSTANTS } from "@/features/payments/constants/payment-ui.constants";
import { useResumeAppointmentPayment } from "@/generated/api/appointments/appointments";
import type { AppointmentResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { formatDateTime } from "@/lib/utils/date-time";
import { formatMoney } from "@/lib/utils/money";

/**
 * The appointment's deposit or prepayment: what is owed or was paid, a way
 * to pay while the time is still held, and the outcome after returning from Stripe.
 */
export function AppointmentPayment({ appointment }: { appointment: AppointmentResponse }) {
  const searchParams = useSearchParams();
  const returned = searchParams.get("payment");
  const resumeMutation = useResumeAppointmentPayment({
    mutation: {
      onSuccess: (response) => {
        if (response.payment?.checkoutUrl) window.location.assign(response.payment.checkoutUrl);
      },
    },
  });
  const payment = appointment.payment;
  const awaiting = appointment.status === "PENDING_PAYMENT";

  if (!payment && !awaiting) return null;

  const status = payment ? PAYMENT_UI_CONSTANTS.STATUS_PRESENTATION[payment.status] : null;

  return (
    <div className="space-y-3 border-b border-border px-5 py-4 sm:px-6">
      {returned === "success" && awaiting ? (
        <Alert tone="info">Payment received. Confirming your booking, this takes a few seconds…</Alert>
      ) : returned === "success" ? (
        <Alert tone="success">Payment received. Your booking is confirmed.</Alert>
      ) : returned === "cancelled" && awaiting ? (
        <Alert tone="warning">The payment was not completed. The time is still held for you for now.</Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted">
            {payment?.kind === "FULL" ? "Payment" : "Deposit"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            {payment ? formatMoney(payment.amountMinor, payment.currency) : "Payment required"}
            {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
          </p>
          {payment && payment.refundedMinor > 0 ? (
            <p className="mt-0.5 text-xs text-muted">
              {formatMoney(payment.refundedMinor, payment.currency)} refunded
            </p>
          ) : payment?.paidAt ? (
            <p className="mt-0.5 text-xs text-muted">Paid {formatDateTime(payment.paidAt, appointment.timeZone)}</p>
          ) : awaiting && appointment.holdExpiresAt ? (
            <p className="mt-0.5 text-xs text-muted">
              Pay by {formatDateTime(appointment.holdExpiresAt, appointment.timeZone)} to keep this time.
            </p>
          ) : null}
        </div>
        {awaiting ? (
          <Button isLoading={resumeMutation.isPending} onClick={() => resumeMutation.mutate({ appointmentId: appointment.id })}>
            Pay now
          </Button>
        ) : null}
      </div>

      {resumeMutation.error ? (
        <Alert tone="danger">{getApiErrorMessage(resumeMutation.error, "The payment page could not be opened.")}</Alert>
      ) : null}
    </div>
  );
}
