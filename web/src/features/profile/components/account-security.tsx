"use client";

import { useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { KeyIcon, MailIcon, PhoneIcon } from "@/components/ui/icons";
import { SectionCard } from "@/components/ui/section-card";
import { useAuth } from "@/features/auth/auth-context";
import { PhoneCodeForm } from "@/features/auth/components/phone-code-form";
import {
  confirmPhoneLink,
  sendPhoneLinkCode,
  useForgotPassword,
  useGetProviders,
  useResendVerification,
} from "@/generated/api/authentication/authentication";
import type { AuthUserResponse } from "@/generated/api/models";

export function AccountSecurity({ user }: { user: AuthUserResponse }) {
  const { updateUser } = useAuth();
  const providers = useGetProviders({ query: { staleTime: Infinity } });
  const resendMutation = useResendVerification();
  const resetMutation = useForgotPassword();
  const [isLinkingPhone, setIsLinkingPhone] = useState(false);

  return (
    <SectionCard
      className="mt-5"
      description="How you sign in and how we can reach you."
      title="Sign-in and security"
    >
      <div className="divide-y divide-border">
        <SecurityRow
          action={
            user.emailVerified ? null : resendMutation.isSuccess ? (
              <span className="text-xs text-muted">Link sent</span>
            ) : (
              <Button
                isLoading={resendMutation.isPending}
                onClick={() => resendMutation.mutate()}
                size="sm"
                variant="secondary"
              >
                Resend link
              </Button>
            )
          }
          icon={<MailIcon className="size-[18px]" />}
          label="Email"
          status={
            <Badge tone={user.emailVerified ? "success" : "warning"}>
              {user.emailVerified ? "Confirmed" : "Not confirmed"}
            </Badge>
          }
          value={user.email}
        />

        <SecurityRow
          action={
            resetMutation.isSuccess ? (
              <span className="text-xs text-muted">Check your email</span>
            ) : (
              <Button
                isLoading={resetMutation.isPending}
                onClick={() => resetMutation.mutate({ data: { email: user.email } })}
                size="sm"
                variant="secondary"
              >
                {user.hasPassword ? "Change password" : "Set a password"}
              </Button>
            )
          }
          icon={<KeyIcon className="size-[18px]" />}
          label="Password"
          value={
            user.hasPassword
              ? "We'll email you a secure link to choose a new one."
              : "You sign in with Google. Add a password to sign in with email too."
          }
        />

        {providers.data?.phone || user.phone ? (
          <div className="py-4 first:pt-0 last:pb-0">
            <SecurityRow
              action={
                isLinkingPhone ? null : (
                  <Button onClick={() => setIsLinkingPhone(true)} size="sm" variant="secondary">
                    {user.phone ? "Change number" : "Add number"}
                  </Button>
                )
              }
              bare
              icon={<PhoneIcon className="size-[18px]" />}
              label="Phone"
              status={user.phone ? <Badge tone="success">Confirmed</Badge> : null}
              value={user.phone ?? "Add a number to sign in with a text code."}
            />
            {isLinkingPhone ? (
              <div className="mt-4 rounded-lg border border-border bg-surface-subtle p-4">
                {providers.data?.phone ? (
                  <PhoneCodeForm
                    idPrefix="profile-phone"
                    requestCode={(phone) => sendPhoneLinkCode({ phone })}
                    sentMessage={(phone) => `We texted a code to ${phone}. It works for 10 minutes.`}
                    submitLabel="Confirm number"
                    verifyCode={async (phone, code) => {
                      updateUser(await confirmPhoneLink({ phone, code }));
                      setIsLinkingPhone(false);
                    }}
                  />
                ) : (
                  <Alert tone="info">Text messages aren&apos;t available yet.</Alert>
                )}
                <Button
                  className="mt-2"
                  onClick={() => setIsLinkingPhone(false)}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function SecurityRow({
  action,
  bare = false,
  icon,
  label,
  status,
  value,
}: {
  action?: ReactNode;
  bare?: boolean;
  icon: ReactNode;
  label: string;
  status?: ReactNode;
  value: string;
}) {
  return (
    <div
      className={
        bare
          ? "flex flex-wrap items-center gap-3"
          : "flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0"
      }
    >
      <span className="shrink-0 text-brand">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-muted">{label}</p>
          {status}
        </div>
        <p className="mt-1 break-words text-sm text-ink">{value}</p>
      </div>
      {action}
    </div>
  );
}
