"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { AlertIcon, RefreshIcon } from "@/components/ui/icons";
import { useAuth } from "@/features/auth/auth-context";
import { AuthLoadingScreen } from "@/features/auth/components/auth-loading-screen";

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { retryAuthentication, signOut, status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [router, status]);

  if (status === "authenticated") return children;

  if (status === "error") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
        <div className="max-w-sm text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
            <AlertIcon className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">We couldn&apos;t verify your session</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Check that the BookWise server is available, then try again.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <Button leadingIcon={<RefreshIcon className="size-4" />} onClick={retryAuthentication}>
              Try again
            </Button>
            <Button onClick={signOut} variant="secondary">Sign out</Button>
          </div>
        </div>
      </main>
    );
  }

  return <AuthLoadingScreen />;
}
