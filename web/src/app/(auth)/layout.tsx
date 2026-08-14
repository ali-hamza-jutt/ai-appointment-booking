import type { ReactNode } from "react";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { GuestGuard } from "@/features/auth/components/guest-guard";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <GuestGuard>
      <AuthShell>{children}</AuthShell>
    </GuestGuard>
  );
}
