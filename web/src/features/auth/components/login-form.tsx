"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-controls";
import { useAuth } from "@/features/auth/auth-context";
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
  const [submitError, setSubmitError] = useState<string | null>(null);
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
        },
      },
      {
        onError: (error) => {
          setErrors({
            email: getApiFieldError(error, "email"),
            password: getApiFieldError(error, "password"),
          });
          setSubmitError(
            getApiErrorMessage(
              error,
              "We could not sign you in. Check your connection and try again.",
            ),
          );
        },
        onSuccess: (response) => {
          completeAuthentication(response, rememberMe ? "local" : "session");
          startTransition(() => router.replace("/book"));
        },
      },
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Sign in to manage and book your appointments.
      </p>

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
            Remember me
          </label>
          <span className="text-xs text-subtle">Forgot password support coming soon</span>
        </div>

        <Button fullWidth isLoading={isSubmitting} size="lg" type="submit">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link className="font-semibold text-brand hover:text-brand-hover" href="/signup">
          Create one
        </Link>
      </p>
    </section>
  );
}
