"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LinkButton } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/feedback";
import { useAuth } from "@/features/auth/auth-context";
import { AuthCard } from "@/features/auth/components/auth-card";

/**
 * Google redirects here after setting the refresh cookie; the auth
 * provider restores the session from it, then we continue into the app.
 */
export function OAuthCallbackView() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") router.replace("/book");
  }, [router, status]);

  if (status === "loading" || status === "authenticated") {
    return (
      <AuthCard title="Signing you in">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Spinner className="size-5" />
          Finishing Google sign-in…
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Sign-in didn't finish">
      <Alert tone="danger">We couldn&apos;t complete Google sign-in. Please try again.</Alert>
      <LinkButton className="mt-4" fullWidth href="/login" size="lg">
        Back to sign in
      </LinkButton>
    </AuthCard>
  );
}
