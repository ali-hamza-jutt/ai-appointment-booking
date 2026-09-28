"use client";

import { useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/auth-context";
import { useImpersonateUser } from "@/generated/api/platform-admin/platform-admin";
import { refreshSession } from "@/lib/auth/session";

/**
 * Signs this tab in as another user with a 15-minute token. The admin's own
 * session stays in its refresh cookie, so reloading the page (or the token
 * running out) brings it back.
 */
export function useImpersonation() {
  const router = useRouter();
  const { completeAuthentication } = useAuth();

  return useImpersonateUser({
    mutation: {
      onSuccess: (response) => {
        completeAuthentication({
          accessToken: response.accessToken,
          tokenType: response.tokenType,
          expiresIn: response.expiresIn,
          user: response.user,
        });
        router.push("/book");
      },
    },
  });
}

/**
 * Ends an impersonation: the borrowed token only lives in this tab's memory,
 * so refreshing from the admin's own cookie swaps their session back in.
 */
export function useEndImpersonation(): () => Promise<void> {
  const router = useRouter();
  const { completeAuthentication } = useAuth();

  return async () => {
    const session = await refreshSession().catch(() => null);

    if (!session) {
      router.replace("/login");
      return;
    }

    completeAuthentication(session);
    router.push("/admin");
  };
}
