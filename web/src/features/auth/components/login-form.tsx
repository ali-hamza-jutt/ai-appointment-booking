"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-controls";
import { PasswordToggle } from "@/features/auth/components/password-toggle";

interface LoginErrors {
  email?: string;
  password?: string;
}

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const nextErrors: LoginErrors = {};
    if (!email.trim()) nextErrors.email = "Enter your email address.";
    if (!password) nextErrors.password = "Enter your password.";
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    startTransition(() => router.push("/book"));
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Sign in to manage and book your appointments.
      </p>

      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        {errors.email || errors.password ? (
          <Alert tone="danger">Please correct the highlighted fields.</Alert>
        ) : null}

        <TextField
          autoComplete="email"
          disabled={isPending}
          error={errors.email}
          id="login-email"
          label="Email"
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((current) => ({ ...current, email: undefined }));
          }}
          placeholder="you@example.com"
          type="email"
          value={email}
        />

        <TextField
          autoComplete="current-password"
          disabled={isPending}
          error={errors.password}
          id="login-password"
          label="Password"
          onChange={(event) => {
            setPassword(event.target.value);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
          placeholder="Enter your password"
          trailingAction={
            <PasswordToggle
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
              className="size-4 accent-brand"
              disabled={isPending}
              type="checkbox"
            />
            Remember me
          </label>
          <button className="text-xs font-semibold text-brand hover:text-brand-hover" type="button">
            Forgot password?
          </button>
        </div>

        <Button fullWidth isLoading={isPending} size="lg" type="submit">
          {isPending ? "Signing in…" : "Sign in"}
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
