import type { ReactNode } from "react";

import { AuthShell } from "@/features/auth/components/auth-shell";

/** Account links (email confirmation, OAuth return) work signed in or out. */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
