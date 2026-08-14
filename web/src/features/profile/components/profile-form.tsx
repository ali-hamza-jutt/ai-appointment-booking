"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/form-controls";
import { CheckIcon } from "@/components/ui/icons";
import { useAuth } from "@/features/auth/auth-context";
import { getUserInitials } from "@/features/auth/utils/user-display";

const timezones = [
  "Asia/Karachi",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function ProfileForm() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setIsSaved(false);
    setIsSaving(true);
    timerRef.current = window.setTimeout(() => {
      setIsSaving(false);
      setIsSaved(true);
    }, 700);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-ink">Profile settings</h2>
        <p className="mt-1 text-sm text-muted">Manage your account information and booking preferences.</p>
      </div>

      {isSaved ? <Alert className="mb-4" tone="success">Your profile changes were saved.</Alert> : null}

      <form className="overflow-hidden rounded-xl border border-border bg-surface shadow-card" onSubmit={handleSubmit}>
        <div className="flex items-center gap-4 border-b border-border p-5 sm:p-6">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-base font-bold text-brand">
            {getUserInitials(user?.fullName ?? "") || "BW"}
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">{user?.fullName}</p>
            <p className="mt-0.5 text-xs text-muted">{user?.email}</p>
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <TextField
            autoComplete="name"
            disabled={isSaving}
            id="profile-name"
            label="Full name"
            onChange={(event) => setFullName(event.target.value)}
            required
            value={fullName}
          />
          <TextField
            autoComplete="email"
            disabled={isSaving}
            id="profile-email"
            label="Email address"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <div className="sm:col-span-2">
            <SelectField
              disabled={isSaving}
              hint="Appointment times will be shown and created in this timezone."
              id="profile-timezone"
              label="Default timezone"
              onChange={(event) => setTimezone(event.target.value)}
              value={timezone}
            >
              {timezones.map((timezoneOption) => (
                <option key={timezoneOption} value={timezoneOption}>{timezoneOption}</option>
              ))}
            </SelectField>
          </div>
        </div>

        <footer className="flex justify-end border-t border-border bg-surface-subtle p-4 sm:px-6">
          <Button isLoading={isSaving} leadingIcon={<CheckIcon className="size-4" />} type="submit">
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </footer>
      </form>
    </div>
  );
}
