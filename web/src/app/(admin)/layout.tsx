import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { AdminGuard } from "@/features/admin/components/admin-guard";
import { AuthGuard } from "@/features/auth/components/auth-guard";
import { ActiveBusinessProvider } from "@/features/business-settings/context/active-business-context";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <ActiveBusinessProvider>
        <AppShell>
          <AdminGuard>{children}</AdminGuard>
        </AppShell>
      </ActiveBusinessProvider>
    </AuthGuard>
  );
}
