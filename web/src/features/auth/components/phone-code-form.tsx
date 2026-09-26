"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { getApiErrorMessage } from "@/lib/api/api-error";

const CODE_PATTERN = /^\d{6}$/;

interface PhoneCodeFormProps {
  idPrefix: string;
  /** Sends a code to the number; rejects with an API error on failure. */
  requestCode: (phone: string) => Promise<unknown>;
  /** Checks the code; rejects with an API error on failure. */
  verifyCode: (phone: string, code: string) => Promise<unknown>;
  sentMessage: (phone: string) => string;
  submitLabel: string;
  initialPhone?: string;
}

/** Two steps: enter a phone number, then the 6-digit code texted to it. */
export function PhoneCodeForm({
  idPrefix,
  initialPhone = "",
  requestCode,
  sentMessage,
  submitLabel,
  verifyCode,
}: PhoneCodeFormProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setIsBusy(true);
    setError(null);

    try {
      await action();
      return true;
    } catch (failure) {
      setError(getApiErrorMessage(failure, fallback));
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRequest(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (phone.trim().length < 7) {
      setError("Enter your phone number with the country code, for example +44 7700 900123.");
      return;
    }

    if (await run(() => requestCode(phone.trim()), "We couldn't send a code. Please try again.")) {
      setCode("");
      setStep("code");
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!CODE_PATTERN.test(code)) {
      setError("Enter the 6-digit code.");
      return;
    }

    await run(() => verifyCode(phone.trim(), code), "That code didn't work. Please try again.");
  }

  if (step === "code") {
    return (
      <form className="space-y-4" noValidate onSubmit={(event) => void handleVerify(event)}>
        <Alert tone="info">{sentMessage(phone.trim())}</Alert>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <TextField
          autoComplete="one-time-code"
          id={`${idPrefix}-code`}
          inputMode="numeric"
          label="6-digit code"
          maxLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          value={code}
        />
        <Button fullWidth isLoading={isBusy} type="submit">
          {submitLabel}
        </Button>
        <div className="flex flex-wrap justify-between gap-2">
          <Button disabled={isBusy} onClick={() => setStep("phone")} size="sm" variant="ghost">
            Change number
          </Button>
          <Button disabled={isBusy} onClick={() => void handleRequest()} size="sm" variant="ghost">
            Send a new code
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form className="space-y-4" noValidate onSubmit={(event) => void handleRequest(event)}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <TextField
        autoComplete="tel"
        hint="Include the country code, for example +44 7700 900123."
        id={`${idPrefix}-phone`}
        inputMode="tel"
        label="Phone number"
        maxLength={24}
        onChange={(event) => setPhone(event.target.value)}
        type="tel"
        value={phone}
      />
      <Button fullWidth isLoading={isBusy} type="submit">
        Text me a code
      </Button>
    </form>
  );
}
