"use client";

import type { ReactNode } from "react";

import { Alert } from "@/components/ui/feedback";
import { PageContainer } from "@/components/ui/page-header";
import { useAuth } from "@/features/auth/auth-context";

/** The admin pages, for platform admins only; the API checks too. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (user?.platformRole !== "ADMIN") {
    return (
      <PageContainer size="narrow">
        <Alert tone="info">This area is for BookWise platform admins.</Alert>
      </PageContainer>
    );
  }

  return children;
}
