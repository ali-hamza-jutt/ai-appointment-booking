"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form-controls";
import { AUTH_LINK_CLASS, AuthCard } from "@/features/auth/components/auth-card";
import {
  isPasswordAcceptable,
  PasswordRequirements,
} from "@/features/auth/components/password-requirements";
import { PasswordToggle } from "@/features/auth/components/password-toggle";
import { useResetPassword } from "@/generated/api/authentication/authentication";
import { getApiErrorMessage } from "@/lib/api/api-error";

export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const resetMutation = useResetPassword();
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isPasswordAcceptable(password)) {
      setError("Your password must meet all requirements.");
      return;
    }

    resetMutation.mutate({ data: { token, password } });
  }

  if (!token) {
    return (
      <AuthCard title="Link incomplete">
        <Alert tone="danger">This reset link is missing its code. Open the link from the email again.</Alert>
        <LinkButton className="mt-4" fullWidth href="/forgot-password" variant="secondary">
          Request a new link
        </LinkButton>
      </AuthCard>
    );
  }

  if (resetMutation.isSuccess) {
    return (
      <AuthCard title="Password changed">
        <Alert tone="success">
          Your new password is set and every other device has been signed out.
        </Alert>
        <LinkButton className="mt-4" fullWidth href="/login" size="lg">
          Sign in
        </LinkButton>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description="Choose a new password for your BookWise account."
      footer={
        <Link className={AUTH_LINK_CLASS} href="/forgot-password">
          Need a new link?
        </Link>
      }
      title="Choose a new password"
    >
      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        {resetMutation.error ? (
          <Alert tone="danger">
            {getApiErrorMessage(resetMutation.error, "We couldn't change your password. Please try again.")}
          </Alert>
        ) : null}
        <div>
          <TextField
            autoComplete="new-password"
            error={error}
            id="reset-password"
            label="New password"
            maxLength={128}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(undefined);
            }}
            trailingAction={
              <PasswordToggle
                isVisible={isPasswordVisible}
                onToggle={() => setIsPasswordVisible((value) => !value)}
              />
            }
            type={isPasswordVisible ? "text" : "password"}
            value={password}
          />
          <PasswordRequirements password={password} />
        </div>
        <Button fullWidth isLoading={resetMutation.isPending} size="lg" type="submit">
          Save new password
        </Button>
      </form>
    </AuthCard>
  );
}
