"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/auth-context";
import { AUTH_LINK_CLASS, AuthCard } from "@/features/auth/components/auth-card";
import { PhoneCodeForm } from "@/features/auth/components/phone-code-form";
import {
  sendPhoneSignInCode,
  signInWithPhone,
} from "@/generated/api/authentication/authentication";

export function PhoneSignInForm() {
  const router = useRouter();
  const { completeAuthentication } = useAuth();

  return (
    <AuthCard
      description="Use the phone number you confirmed in your profile."
      footer={
        <Link className={AUTH_LINK_CLASS} href="/login">
          Sign in with email instead
        </Link>
      }
      title="Sign in with a text code"
    >
      <PhoneCodeForm
        idPrefix="phone-sign-in"
        requestCode={(phone) => sendPhoneSignInCode({ phone })}
        sentMessage={(phone) =>
          `If ${phone} is linked to an account, a code is on its way. It works for 10 minutes.`
        }
        submitLabel="Sign in"
        verifyCode={async (phone, code) => {
          completeAuthentication(await signInWithPhone({ phone, code, rememberMe: true }));
          router.replace("/book");
        }}
      />
    </AuthCard>
  );
}
