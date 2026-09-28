"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/auth-context";
import { getNextPath } from "@/features/auth/utils/next-path";
import { AlternativeSignIn } from "@/features/auth/components/alternative-sign-in";
import { AUTH_LINK_CLASS, AuthCard } from "@/features/auth/components/auth-card";
import { PasswordToggle } from "@/features/auth/components/password-toggle";
import type { LoginFormErrors } from "@/features/auth/types/auth-context";
import { isValidEmail } from "@/features/auth/utils/auth-validation";
import { useSignIn } from "@/generated/api/authentication/authentication";
import { getApiErrorMessage, getApiFieldError } from "@/lib/api/api-error";

export function LoginForm() {
  const router = useRouter();
  const { completeAuthentication } = useAuth();
  const signInMutation = useSignIn();
  const [isNavigating, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const searchParams = useSearchParams();
  const [submitError, setSubmitError] = useState<string | null>(() =>
    searchParams.get("error") === "google"
      ? "Google sign-in didn't complete. Please try again or use your password."
      : null,
  );
  const isSubmitting = signInMutation.isPending || isNavigating;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const nextErrors: LoginFormErrors = {};
    if (!email.trim()) {
      nextErrors.email = "Enter your email address.";
    } else if (!isValidEmail(email)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!password) nextErrors.password = "Enter your password.";
    setErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0) return;

    signInMutation.mutate(
      {
        data: {
          email: email.trim(),
          password,
          rememberMe,
        },
      },
      {
        onError: (error) => {
          setErrors({
            email: getApiFieldError(
              error,
              "email",
              "Enter a valid email address.",
            ),
            password: getApiFieldError(
              error,
              "password",
              "Check your password and try again.",
            ),
          });
          setSubmitError(
            getApiErrorMessage(
              error,
              "We could not sign you in. Please try again later.",
            ),
          );
        },
        onSuccess: (response) => {
          completeAuthentication(response);
          startTransition(() => router.replace(getNextPath()));
        },
      },
    );
  }

  return (
    <AuthCard
      description="Sign in to manage and book your appointments."
      footer={(
        <>
          Don&apos;t have an account?{" "}
          <Link className={AUTH_LINK_CLASS} href="/signup">
            Create one
          </Link>
        </>
      )}
      title="Welcome back"
    >

      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}

        <TextField
          autoComplete="email"
          disabled={isSubmitting}
          error={errors.email}
          id="login-email"
          label="Email"
          maxLength={254}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((current) => ({ ...current, email: undefined }));
            setSubmitError(null);
          }}
          placeholder="you@example.com"
          type="email"
          value={email}
        />

        <TextField
          autoComplete="current-password"
          disabled={isSubmitting}
          error={errors.password}
          id="login-password"
          label="Password"
          maxLength={128}
          onChange={(event) => {
            setPassword(event.target.value);
            setErrors((current) => ({ ...current, password: undefined }));
            setSubmitError(null);
          }}
          placeholder="Enter your password"
          trailingAction={
            <PasswordToggle
              disabled={isSubmitting}
              isVisible={isPasswordVisible}
              onToggle={() => setIsPasswordVisible((value) => !value)}
            />
          }
          type={isPasswordVisible ? "text" : "password"}
          value={password}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 py-1">
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input
              checked={rememberMe}
              className="size-4 accent-brand"
              disabled={isSubmitting}
              onChange={(event) => setRememberMe(event.target.checked)}
              type="checkbox"
            />
            Keep me signed in
          </label>
          <Link
            className="text-xs font-semibold text-brand hover:text-brand-hover"
            href="/forgot-password"
          >
            Forgot password?
          </Link>
        </div>

        <Button fullWidth isLoading={isSubmitting} size="lg" type="submit">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <AlternativeSignIn />

    </AuthCard>
  );
}
