"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/feedback";
import { useAuth } from "@/features/auth/auth-context";
import { AuthCard } from "@/features/auth/components/auth-card";
import { verifyEmail } from "@/generated/api/authentication/authentication";
import type { AuthUserResponse } from "@/generated/api/models";
import { getApiErrorMessage } from "@/lib/api/api-error";

export function VerifyEmailView() {
  const token = useSearchParams().get("token") ?? "";
  const { status, updateUser, user } = useAuth();
  const [result, setResult] = useState<
    { state: "pending" } | { state: "verified"; user: AuthUserResponse } | { state: "failed"; error: unknown }
  >({ state: "pending" });
  const requested = useRef(false);

  // Links are single-use, so submit once even under strict-mode double effects.
  useEffect(() => {
    if (!token || requested.current) return;

    requested.current = true;
    verifyEmail({ token }).then(
      (verified) => setResult({ state: "verified", user: verified }),
      (error: unknown) => setResult({ state: "failed", error }),
    );
  }, [token]);

  useEffect(() => {
    if (result.state === "verified" && user?.id === result.user.id) updateUser(result.user);
  }, [result, updateUser, user?.id]);

  const nextHref = status === "authenticated" ? "/book" : "/login";
  const nextLabel = status === "authenticated" ? "Continue to BookWise" : "Sign in";

  return (
    <AuthCard title="Confirm your email">
      {!token ? (
        <Alert tone="danger">This link is missing its code. Open the link from the email again.</Alert>
      ) : result.state === "verified" ? (
        <Alert tone="success">Thanks, {result.user.email} is confirmed.</Alert>
      ) : result.state === "failed" ? (
        <Alert tone="danger">
          {getApiErrorMessage(result.error, "We couldn't confirm your email.")} You can ask for a new
          link from your profile.
        </Alert>
      ) : (
        <div className="flex items-center gap-3 text-sm text-muted">
          <Spinner className="size-5" />
          Confirming your email…
        </div>
      )}
      {token && result.state === "pending" ? null : (
        <LinkButton className="mt-4" fullWidth href={nextHref} size="lg">
          {nextLabel}
        </LinkButton>
      )}
    </AuthCard>
  );
}
