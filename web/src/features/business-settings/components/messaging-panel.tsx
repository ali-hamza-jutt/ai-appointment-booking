"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/form-controls";
import { SectionCard } from "@/components/ui/section-card";
import {
  getListMessagingNumbersQueryKey,
  useAddMessagingNumber,
  useListMessagingNumbers,
  useRemoveMessagingNumber,
} from "@/generated/api/businesses/businesses";
import type { BusinessResponse, MessagingChannel } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";

const CHANNEL_LABELS: Record<MessagingChannel, string> = { SMS: "Text message", WHATSAPP: "WhatsApp" };

/** Twilio numbers customers can text or WhatsApp to book with the assistant. */
export function MessagingPanel({ business, canEdit }: { business: BusinessResponse; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<MessagingChannel>("SMS");
  const [number, setNumber] = useState("");
  const numbersQuery = useListMessagingNumbers(business.id);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListMessagingNumbersQueryKey(business.id) });
  const addMutation = useAddMessagingNumber({
    mutation: {
      onSuccess: () => {
        setNumber("");
        return refresh();
      },
    },
  });
  const removeMutation = useRemoveMessagingNumber({ mutation: { onSuccess: refresh } });
  const numbers = numbersQuery.data?.items ?? [];

  function addNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (number.trim()) addMutation.mutate({ businessId: business.id, data: { channel, number: number.trim() } });
  }

  return (
    <SectionCard
      description="Customers can book by texting or WhatsApp-ing these numbers. The assistant answers, times come as numbered options, and they reply YES to confirm."
      title="Text and WhatsApp"
    >
      <div className="space-y-4">
        {numbersQuery.isPending ? (
          <Skeleton className="h-12 rounded-lg" />
        ) : numbers.length === 0 ? (
          <p className="text-sm text-subtle">No numbers connected.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {numbers.map((item) => (
              <li className="flex items-center justify-between gap-3 px-4 py-2" key={item.id}>
                <span className="flex items-center gap-2 text-sm text-ink">
                  {item.number}
                  <Badge tone="neutral">{CHANNEL_LABELS[item.channel]}</Badge>
                </span>
                {canEdit ? (
                  <Button
                    isLoading={removeMutation.isPending && removeMutation.variables?.numberId === item.id}
                    onClick={() => removeMutation.mutate({ businessId: business.id, numberId: item.id })}
                    size="sm"
                    variant="ghost"
                  >
                    Disconnect
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <form className="flex flex-wrap items-end gap-2" onSubmit={addNumber}>
            <div className="w-40">
              <SelectField
                id="messaging-channel"
                label="Channel"
                onChange={(event) => setChannel(event.target.value as MessagingChannel)}
                value={channel}
              >
                <option value="SMS">{CHANNEL_LABELS.SMS}</option>
                <option value="WHATSAPP">{CHANNEL_LABELS.WHATSAPP}</option>
              </SelectField>
            </div>
            <div className="min-w-48 flex-1">
              <TextField
                id="messaging-number"
                label="Twilio number"
                onChange={(event) => setNumber(event.target.value)}
                placeholder="+1 555 000 1111"
                type="tel"
                value={number}
              />
            </div>
            <Button disabled={!number.trim()} isLoading={addMutation.isPending} type="submit" variant="secondary">
              Connect number
            </Button>
          </form>
        ) : null}

        {addMutation.error || removeMutation.error ? (
          <Alert tone="danger">
            {getApiErrorMessage(addMutation.error ?? removeMutation.error, "The number could not be saved. Check it includes the country code.")}
          </Alert>
        ) : null}

        {numbersQuery.data ? (
          <p className="text-xs text-muted">
            In Twilio, set each number&apos;s &ldquo;A message comes in&rdquo; webhook to{" "}
            <code className="break-all rounded bg-surface-subtle px-1 py-0.5 text-ink">{numbersQuery.data.webhookUrl}</code> (HTTP POST).
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
