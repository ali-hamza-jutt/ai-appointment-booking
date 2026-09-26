"use client";

import { LinkButton } from "@/components/ui/button";
import { GoogleIcon, PhoneIcon } from "@/components/ui/icons";
import { useGetProviders } from "@/generated/api/authentication/authentication";
import { publicEnv } from "@/lib/config/public-env";

export const GOOGLE_SIGN_IN_URL = `${publicEnv.apiBaseUrl}/auth/google/start`;

/** Google and phone sign-in, shown only when this deployment offers them. */
export function AlternativeSignIn({ showPhone = true }: { showPhone?: boolean }) {
  const providers = useGetProviders({ query: { staleTime: Infinity } });
  const hasGoogle = providers.data?.google ?? false;
  const hasPhone = showPhone && (providers.data?.phone ?? false);

  if (!hasGoogle && !hasPhone) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 text-xs text-subtle">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="mt-4 grid gap-2">
        {hasGoogle ? (
          <LinkButton
            fullWidth
            href={GOOGLE_SIGN_IN_URL}
            leadingIcon={<GoogleIcon className="size-4" />}
            prefetch={false}
            variant="secondary"
          >
            Continue with Google
          </LinkButton>
        ) : null}
        {hasPhone ? (
          <LinkButton
            fullWidth
            href="/login/phone"
            leadingIcon={<PhoneIcon className="size-4" />}
            variant="secondary"
          >
            Sign in with a text code
          </LinkButton>
        ) : null}
      </div>
    </div>
  );
}
