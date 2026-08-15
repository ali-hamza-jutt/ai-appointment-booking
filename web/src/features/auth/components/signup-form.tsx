"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-controls";
import { CheckCircleIcon } from "@/components/ui/icons";
import { Alert } from "@/components/ui/feedback";
import { useAuth } from "@/features/auth/auth-context";
import { PasswordToggle } from "@/features/auth/components/password-toggle";
import type { SignupFormErrors } from "@/features/auth/types/auth-context";
import {
  getPasswordRequirements,
  isValidEmail,
} from "@/features/auth/utils/auth-validation";
import { useSignUp } from "@/generated/api/authentication/authentication";
import {
  getApiErrorMessage,
  getApiFieldError,
  isApiError,
} from "@/lib/api/api-error";
import { cn } from "@/lib/utils/cn";

export function SignupForm() {
  const router = useRouter();
  const { completeAuthentication } = useAuth();
  const signUpMutation = useSignUp();
  const [isNavigating, startTransition] = useTransition();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isPasswordConfirmationVisible, setIsPasswordConfirmationVisible] =
    useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<SignupFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isSubmitting = signUpMutation.isPending || isNavigating;

  const passwordRules = getPasswordRequirements(password);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const nextErrors: SignupFormErrors = {};
    if (fullName.trim().length < 2) {
      nextErrors.fullName = "Enter at least 2 characters.";
    }
    if (!email.trim()) {
      nextErrors.email = "Enter your email address.";
    } else if (!isValidEmail(email)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!passwordRules.every((rule) => rule.valid)) {
      nextErrors.password = "Your password must meet all requirements.";
    }
    if (passwordConfirmation !== password) {
      nextErrors.passwordConfirmation = "Passwords do not match.";
    }
    if (!hasAcceptedTerms) nextErrors.terms = "Accept the terms to continue.";
    setErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0) return;

    signUpMutation.mutate(
      {
        data: {
          email: email.trim(),
          fullName: fullName.trim(),
          password,
        },
      },
      {
        onError: (error) => {
          setErrors({
            email:
              getApiFieldError(
                error,
                "email",
                "Enter a valid email address.",
              ) ??
              (isApiError(error) && error.code === "EMAIL_ALREADY_EXISTS"
                ? getApiErrorMessage(
                    error,
                    "An account with this email already exists.",
                  )
                : undefined),
            fullName: getApiFieldError(
              error,
              "fullName",
              "Enter a valid full name.",
            ),
            password: getApiFieldError(
              error,
              "password",
              "Your password must meet all requirements.",
            ),
          });
          setSubmitError(
            getApiErrorMessage(
              error,
              "We could not create your account. Please try again later.",
            ),
          );
        },
        onSuccess: (response) => {
          completeAuthentication(response, "session");
          startTransition(() => router.replace("/book"));
        },
      },
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Book appointments in seconds with a little help from AI.
      </p>

      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}

        <TextField
          autoComplete="name"
          disabled={isSubmitting}
          error={errors.fullName}
          id="signup-name"
          label="Full name"
          maxLength={80}
          onChange={(event) => {
            setFullName(event.target.value);
            setErrors((current) => ({ ...current, fullName: undefined }));
            setSubmitError(null);
          }}
          placeholder="Jordan Rivera"
          value={fullName}
        />
        <TextField
          autoComplete="email"
          disabled={isSubmitting}
          error={errors.email}
          id="signup-email"
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
        <div>
          <TextField
            autoComplete="new-password"
            disabled={isSubmitting}
            error={errors.password}
            id="signup-password"
            label="Password"
            maxLength={128}
            onChange={(event) => {
              setPassword(event.target.value);
              setErrors((current) => ({ ...current, password: undefined }));
              setSubmitError(null);
            }}
            placeholder="Create a password"
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
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {passwordRules.map((rule) => (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs",
                  rule.valid ? "text-success" : "text-muted",
                )}
                key={rule.label}
              >
                <CheckCircleIcon className="size-3.5" />
                {rule.label}
              </span>
            ))}
          </div>
        </div>
        <TextField
          autoComplete="new-password"
          disabled={isSubmitting}
          error={errors.passwordConfirmation}
          id="signup-password-confirmation"
          label="Confirm password"
          maxLength={128}
          onChange={(event) => {
            setPasswordConfirmation(event.target.value);
            setErrors((current) => ({ ...current, passwordConfirmation: undefined }));
            setSubmitError(null);
          }}
          placeholder="Re-enter your password"
          trailingAction={
            <PasswordToggle
              disabled={isSubmitting}
              fieldLabel="confirmation password"
              isVisible={isPasswordConfirmationVisible}
              onToggle={() =>
                setIsPasswordConfirmationVisible((value) => !value)
              }
            />
          }
          type={isPasswordConfirmationVisible ? "text" : "password"}
          value={passwordConfirmation}
        />

        <div>
          <label className="flex items-start gap-2.5 text-xs leading-5 text-ink-soft">
            <input
              checked={hasAcceptedTerms}
              className="mt-0.5 size-4 shrink-0 accent-brand"
              disabled={isSubmitting}
              onChange={(event) => {
                setHasAcceptedTerms(event.target.checked);
                setErrors((current) => ({ ...current, terms: undefined }));
              }}
              type="checkbox"
            />
            <span>
              I agree to the <span className="font-semibold text-brand">Terms of Service</span> and{" "}
              <span className="font-semibold text-brand">Privacy Policy</span>.
            </span>
          </label>
          {errors.terms ? <p className="mt-1 text-xs text-danger">{errors.terms}</p> : null}
        </div>

        <Button fullWidth isLoading={isSubmitting} size="lg" type="submit">
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link className="font-semibold text-brand hover:text-brand-hover" href="/login">
          Sign in
        </Link>
      </p>
    </section>
  );
}
