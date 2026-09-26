"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  getGetCurrentUserQueryKey,
  useGetCurrentUser,
} from "@/generated/api/authentication/authentication";
import type { AuthResponse, AuthUserResponse } from "@/generated/api/models";
import {
  broadcastAuthChange,
  endSession,
  getAccessToken,
  refreshSession,
  setAccessToken,
  subscribeToAccessToken,
  subscribeToAuthBroadcasts,
} from "@/lib/auth/session";
import type { AuthContextValue } from "@/features/auth/types/auth-context";

const AuthContext = createContext<AuthContextValue | null>(null);

type RestoreState = "pending" | "done" | "failed";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const accessToken = useSyncExternalStore(subscribeToAccessToken, getAccessToken, () => null);
  const [restoreState, setRestoreState] = useState<RestoreState>("pending");
  const userIdRef = useRef<string | null>(null);

  /** Drops cached data when the signed-in person changes, never on a token refresh. */
  const adoptUser = useCallback(
    (user: AuthUserResponse | null) => {
      const nextUserId = user?.id ?? null;

      if (userIdRef.current !== nextUserId) queryClient.removeQueries();

      userIdRef.current = nextUserId;
      if (user) queryClient.setQueryData(getGetCurrentUserQueryKey(), user);
    },
    [queryClient],
  );

  const restoreSession = useCallback(
    () =>
      refreshSession().then(
        (session) => {
          adoptUser(session?.user ?? null);
          setRestoreState("done");
        },
        () => setRestoreState("failed"),
      ),
    [adoptUser],
  );

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(
    () =>
      subscribeToAuthBroadcasts((message) => {
        if (message.type === "signed-out") {
          setAccessToken(null);
          adoptUser(null);
        } else {
          void restoreSession();
        }
      }),
    [adoptUser, restoreSession],
  );

  // Losing the token (for example after a failed refresh) signs this tab out.
  useEffect(() => {
    if (restoreState === "done" && !accessToken && userIdRef.current) adoptUser(null);
  }, [accessToken, adoptUser, restoreState]);

  const currentUserQuery = useGetCurrentUser({
    query: {
      enabled: restoreState === "done" && Boolean(accessToken),
      retry: false,
      staleTime: Infinity,
    },
  });

  const completeAuthentication = useCallback(
    (response: AuthResponse) => {
      setAccessToken(response.accessToken);
      adoptUser(response.user);
      setRestoreState("done");
      broadcastAuthChange({ type: "signed-in" });
    },
    [adoptUser],
  );

  const updateUser = useCallback(
    (user: AuthUserResponse) => {
      queryClient.setQueryData(getGetCurrentUserQueryKey(), user);
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await endSession();
    adoptUser(null);
  }, [adoptUser]);

  const retryAuthentication = useCallback(() => {
    if (restoreState === "failed") {
      setRestoreState("pending");
      void restoreSession();
    } else {
      void currentUserQuery.refetch();
    }
  }, [currentUserQuery, restoreSession, restoreState]);

  const status: AuthContextValue["status"] =
    restoreState === "pending"
      ? "loading"
      : restoreState === "failed"
        ? "error"
        : !accessToken
          ? "unauthenticated"
          : currentUserQuery.isPending
            ? "loading"
            : currentUserQuery.isError
              ? "error"
              : "authenticated";

  const value = useMemo<AuthContextValue>(
    () => ({
      completeAuthentication,
      error: currentUserQuery.error,
      retryAuthentication,
      signOut,
      status,
      updateUser,
      user: status === "authenticated" ? (currentUserQuery.data ?? null) : null,
    }),
    [
      completeAuthentication,
      currentUserQuery.data,
      currentUserQuery.error,
      retryAuthentication,
      signOut,
      status,
      updateUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
