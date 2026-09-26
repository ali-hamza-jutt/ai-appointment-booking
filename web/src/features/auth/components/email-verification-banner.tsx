"use client";

import { Button } from "@/components/ui/button";
import { MailIcon } from "@/components/ui/icons";
import { useAuth } from "@/features/auth/auth-context";
import { useResendVerification } from "@/generated/api/authentication/authentication";

/** Reminds signed-in people to confirm their email until they do. */
export function EmailVerificationBanner() {
  const { user } = useAuth();
  const resendMutation = useResendVerification();

  if (!user || user.emailVerified) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-warning-border bg-warning-soft px-4 py-2.5 text-sm text-warning-strong sm:px-6">
      <MailIcon className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        {resendMutation.isSuccess
          ? `We sent a new link to ${user.email}.`
          : `Confirm ${user.email} using the link we emailed you.`}
      </p>
      {resendMutation.isSuccess ? null : (
        <Button
          isLoading={resendMutation.isPending}
          onClick={() => resendMutation.mutate()}
          size="sm"
          variant="secondary"
        >
          Resend link
        </Button>
      )}
    </div>
  );
}
