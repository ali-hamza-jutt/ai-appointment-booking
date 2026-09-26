import type { Metadata } from "next";

import { PhoneSignInForm } from "@/features/auth/components/phone-sign-in-form";

export const metadata: Metadata = { title: "Sign in with a text code" };

export default function PhoneSignInPage() {
  return <PhoneSignInForm />;
}
