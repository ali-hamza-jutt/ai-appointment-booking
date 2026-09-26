import type { Metadata } from "next";

import { OAuthCallbackView } from "@/features/auth/components/oauth-callback-view";

export const metadata: Metadata = { title: "Signing in" };

export default function OAuthCallbackPage() {
  return <OAuthCallbackView />;
}
