"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { AUTH_LINK_CLASS, AuthCard } from "@/features/auth/components/auth-card";
import { isValidEmail } from "@/features/auth/utils/auth-validation";
import { useForgotPassword } from "@/generated/api/authentication/authentication";
import { getApiErrorMessage } from "@/lib/api/api-error";

export function ForgotPasswordForm() {
  const forgotMutation = useForgotPassword();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    forgotMutation.mutate({ data: { email: email.trim() } });
  }

  return (
    <AuthCard
      description="Enter the email you use for BookWise and we'll send you a link to choose a new password."
      footer={
        <Link className={AUTH_LINK_CLASS} href="/login">
          Back to sign in
        </Link>
      }
      title="Reset your password"
    >
      {forgotMutation.isSuccess ? (
        <Alert tone="success">
          If an account uses {email.trim()}, a reset link is on its way. It works for one hour.
        </Alert>
      ) : (
        <form className="space-y-4" noValidate onSubmit={handleSubmit}>
          {forgotMutation.error ? (
            <Alert tone="danger">
              {getApiErrorMessage(forgotMutation.error, "We couldn't send the link. Please try again.")}
            </Alert>
          ) : null}
          <TextField
            autoComplete="email"
            error={error}
            id="forgot-email"
            label="Email"
            maxLength={254}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(undefined);
            }}
            placeholder="you@example.com"
            type="email"
            value={email}
          />
          <Button fullWidth isLoading={forgotMutation.isPending} size="lg" type="submit">
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
