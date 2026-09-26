import type { Metadata } from "next";
import { Suspense } from "react";

import { VerifyEmailView } from "@/features/auth/components/verify-email-view";

export const metadata: Metadata = { title: "Confirm your email" };

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailView />
    </Suspense>
  );
}
