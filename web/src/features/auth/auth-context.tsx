"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getGetCurrentUserQueryKey,
  useGetCurrentUser,
} from "@/generated/api/authentication/authentication";
import { isApiError } from "@/lib/api/api-error";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
  subscribeToAccessTokenChanges,
} from "@/lib/auth/token-storage";
import type { AuthContextValue } from "@/features/auth/types/auth-context";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isInitialized, setIsInitialized] = useState(false);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);

  useEffect(() => {
    const synchronizeToken = () => {
      const nextToken = getAccessToken();

      setAccessTokenState((currentToken) => {
        if (currentToken !== nextToken) {
          queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
        }

        return nextToken;
      });
      setIsInitialized(true);
    };

    synchronizeToken();
    return subscribeToAccessTokenChanges(synchronizeToken);
  }, [queryClient]);

  const currentUserQuery = useGetCurrentUser({
    query: {
      enabled: isInitialized && Boolean(accessToken),
      retry: false,
    },
  });

  const authenticationWasRejected =
    isApiError(currentUserQuery.error) &&
    (currentUserQuery.error.status === 401 || currentUserQuery.error.status === 404);

  useEffect(() => {
    if (authenticationWasRejected) clearAccessToken();
  }, [authenticationWasRejected]);

  const completeAuthentication = useCallback<AuthContextValue["completeAuthentication"]>(
    (response, persistence) => {
      setAccessToken(response.accessToken, persistence);
      setAccessTokenState(response.accessToken);
      queryClient.setQueryData(getGetCurrentUserQueryKey(), response.user);
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    clearAccessToken();
    setAccessTokenState(null);
    queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
  }, [queryClient]);

  const retryAuthentication = useCallback(() => {
    void currentUserQuery.refetch();
  }, [currentUserQuery]);

  const status: AuthContextValue["status"] = !isInitialized
    ? "loading"
    : !accessToken || authenticationWasRejected
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
      user:
        status === "authenticated" ? (currentUserQuery.data ?? null) : null,
    }),
    [
      completeAuthentication,
      currentUserQuery.data,
      currentUserQuery.error,
      retryAuthentication,
      signOut,
      status,
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
