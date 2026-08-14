import type { ReactNode } from "react";

import { BookWiseLogo } from "@/components/brand/bookwise-logo";

interface AuthShellProps {
  children: ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8 sm:px-6">
      <div className="w-full max-w-[440px]">
        <div className="mb-7 flex justify-center">
          <BookWiseLogo />
        </div>
        {children}
      </div>
    </main>
  );
}
