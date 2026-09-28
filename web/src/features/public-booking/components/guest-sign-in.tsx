"use client";

import { useState, type FormEvent } from "react";

import { Button, LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/auth-context";
import { useSendGuestCode, useVerifyGuest } from "@/generated/api/public-booking/public-booking";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";

interface GuestSignInProps {
  slug: string;
  allowGuestBooking: boolean;
  /** Opens sign-in in a new tab, for the widget's frame. */
  embedded?: boolean;
  /** What the guest is signing in for, for example "to book" or "to chat". */
  purpose: string;
}

/**
 * Lets someone without an account continue with their name and email: a
 * code is emailed to them and confirming it signs them in, creating an
 * account the first time.
 */
export function GuestSignIn({ allowGuestBooking, embedded = false, purpose, slug }: GuestSignInProps) {
  const { completeAuthentication } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const sendMutation = useSendGuestCode();
  const verifyMutation = useVerifyGuest({ mutation: { onSuccess: completeAuthentication } });
  const signInHref = `/login?next=${encodeURIComponent(`/b/${slug}`)}`;

  if (!allowGuestBooking) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-surface-subtle p-4">
        <p className="text-sm text-ink-soft">This business asks you to sign in or create an account {purpose}.</p>
        <LinkButton href={signInHref} size="sm" {...(embedded ? { target: "_blank", rel: "noopener" } : {})}>
          Sign in or create an account
        </LinkButton>
      </div>
    );
  }

  function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMutation.mutate(
      { slug, data: { email: email.trim() } },
      { onSuccess: () => setCodeSentTo(email.trim()) },
    );
  }

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    verifyMutation.mutate({
      slug,
      data: {
        email: codeSentTo ?? email.trim(),
        code: code.trim(),
        name: name.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      },
    });
  }

  if (codeSentTo) {
    return (
      <form className="space-y-3" onSubmit={verify}>
        <p className="text-sm text-ink-soft">
          We emailed a 6-digit code to <strong className="text-ink">{codeSentTo}</strong>. It works for 10 minutes.
        </p>
        <TextField
          autoComplete="one-time-code"
          error={getApiFieldError(verifyMutation.error, "code")}
          id="guest-code"
          inputMode="numeric"
          label="Code"
          maxLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          required
          value={code}
        />
        {verifyMutation.error && !getApiFieldError(verifyMutation.error, "code") ? (
          <Alert tone="danger">{getApiErrorMessage(verifyMutation.error, "That didn't work. Please try again.")}</Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={code.length !== 6} isLoading={verifyMutation.isPending} type="submit">
            Continue
          </Button>
          <Button onClick={() => setCodeSentTo(null)} variant="ghost">
            Use another email
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form className="space-y-3" onSubmit={sendCode}>
      <p className="text-sm text-ink-soft">
        Enter your details {purpose}. No password needed: we&apos;ll email you a code.
      </p>
      <TextField
        autoComplete="name"
        id="guest-name"
        label="Your name"
        maxLength={80}
        minLength={2}
        onChange={(event) => setName(event.target.value)}
        required
        value={name}
      />
      <TextField
        autoComplete="email"
        error={getApiFieldError(sendMutation.error, "email")}
        id="guest-email"
        label="Email"
        onChange={(event) => setEmail(event.target.value)}
        required
        type="email"
        value={email}
      />
      <TextField
        autoComplete="tel"
        hint="Optional, so the business can text you about your booking."
        id="guest-phone"
        label="Phone"
        onChange={(event) => setPhone(event.target.value)}
        type="tel"
        value={phone}
      />
      {sendMutation.error && !getApiFieldError(sendMutation.error, "email") ? (
        <Alert tone="danger">{getApiErrorMessage(sendMutation.error, "We couldn't send a code. Please try again.")}</Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={name.trim().length < 2 || !email.trim()} isLoading={sendMutation.isPending} type="submit">
          Email me a code
        </Button>
        <a
          className="text-sm font-semibold text-brand hover:underline"
          href={signInHref}
          {...(embedded ? { target: "_blank", rel: "noopener" } : {})}
        >
          I have an account
        </a>
      </div>
    </form>
  );
}
