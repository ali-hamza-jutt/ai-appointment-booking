import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { AuthGuard } from "@/features/auth/components/auth-guard";
import { ActiveBusinessProvider } from "@/features/business-settings/context/active-business-context";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <ActiveBusinessProvider>
        <AppShell>{children}</AppShell>
      </ActiveBusinessProvider>
    </AuthGuard>
  );
}
