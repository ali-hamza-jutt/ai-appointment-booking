"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/features/auth/auth-context";
import { AuthLoadingScreen } from "@/features/auth/components/auth-loading-screen";

export function GuestGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") router.replace("/book");
  }, [router, status]);

  if (status === "loading" || status === "authenticated") {
    return <AuthLoadingScreen />;
  }

  return children;
}
