"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-controls";
import { CheckCircleIcon } from "@/components/ui/icons";
import { PasswordToggle } from "@/features/auth/components/password-toggle";
import { cn } from "@/lib/utils/cn";

interface SignupErrors {
  email?: string;
  fullName?: string;
  password?: string;
  passwordConfirmation?: string;
  terms?: string;
}

export function SignupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({});

  const passwordRules = [
    { label: "8+ characters", valid: password.length >= 8 },
    { label: "1 number", valid: /\d/.test(password) },
    { label: "1 uppercase", valid: /[A-Z]/.test(password) },
  ];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const nextErrors: SignupErrors = {};
    if (!fullName.trim()) nextErrors.fullName = "Enter your full name.";
    if (!email.trim()) nextErrors.email = "Enter your email address.";
    if (!passwordRules.every((rule) => rule.valid)) {
      nextErrors.password = "Your password must meet all requirements.";
    }
    if (passwordConfirmation !== password) {
      nextErrors.passwordConfirmation = "Passwords do not match.";
    }
    if (!hasAcceptedTerms) nextErrors.terms = "Accept the terms to continue.";
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    startTransition(() => router.push("/book"));
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Book appointments in seconds with a little help from AI.
      </p>

      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        <TextField
          autoComplete="name"
          disabled={isPending}
          error={errors.fullName}
          id="signup-name"
          label="Full name"
          onChange={(event) => {
            setFullName(event.target.value);
            setErrors((current) => ({ ...current, fullName: undefined }));
          }}
          placeholder="Jordan Rivera"
          value={fullName}
        />
        <TextField
          autoComplete="email"
          disabled={isPending}
          error={errors.email}
          id="signup-email"
          label="Email"
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((current) => ({ ...current, email: undefined }));
          }}
          placeholder="you@example.com"
          type="email"
          value={email}
        />
        <div>
          <TextField
            autoComplete="new-password"
            disabled={isPending}
            error={errors.password}
            id="signup-password"
            label="Password"
            onChange={(event) => {
              setPassword(event.target.value);
              setErrors((current) => ({ ...current, password: undefined }));
            }}
            placeholder="Create a password"
            trailingAction={
              <PasswordToggle
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
          disabled={isPending}
          error={errors.passwordConfirmation}
          id="signup-password-confirmation"
          label="Confirm password"
          onChange={(event) => {
            setPasswordConfirmation(event.target.value);
            setErrors((current) => ({ ...current, passwordConfirmation: undefined }));
          }}
          placeholder="Re-enter your password"
          type="password"
          value={passwordConfirmation}
        />

        <div>
          <label className="flex items-start gap-2.5 text-xs leading-5 text-ink-soft">
            <input
              checked={hasAcceptedTerms}
              className="mt-0.5 size-4 shrink-0 accent-brand"
              disabled={isPending}
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

        <Button fullWidth isLoading={isPending} size="lg" type="submit">
          {isPending ? "Creating account…" : "Create account"}
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
