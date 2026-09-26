import type { AuthResponse } from "@/generated/api/models";
import { publicEnv } from "@/lib/config/public-env";

/**
 * The access token lives only in memory; the refresh token is an httpOnly
 * cookie the browser sends to /auth. A reload or a new tab restores the
 * session by refreshing, and a 401 triggers one refresh before giving up.
 */

const REFRESH_LOCK_NAME = "bookwise-session-refresh";
const AUTH_CHANNEL_NAME = "bookwise-auth";

type AuthBroadcast = { type: "signed-in" } | { type: "signed-out" };

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthResponse | null> | null = null;
let channel: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

export class SessionUnavailableError extends Error {
  public constructor() {
    super("The session could not be restored");
    this.name = "SessionUnavailableError";
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  if (token === accessToken) return;

  accessToken = token;
  listeners.forEach((listener) => listener());
}

export function subscribeToAccessToken(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;

  channel ??= new BroadcastChannel(AUTH_CHANNEL_NAME);

  return channel;
}

/** Tells other tabs about a sign-in or sign-out. */
export function broadcastAuthChange(message: AuthBroadcast): void {
  getChannel()?.postMessage(message);
}

export function subscribeToAuthBroadcasts(listener: (message: AuthBroadcast) => void): () => void {
  const target = getChannel();

  if (!target) return () => undefined;

  const handle = (event: MessageEvent<AuthBroadcast>) => listener(event.data);

  target.addEventListener("message", handle);

  return () => target.removeEventListener("message", handle);
}

async function requestRefresh(): Promise<AuthResponse | null> {
  let response: Response;

  try {
    response = await fetch(`${publicEnv.apiBaseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new SessionUnavailableError();
  }

  if (response.status === 401 || response.status === 403) {
    setAccessToken(null);
    return null;
  }

  if (!response.ok) throw new SessionUnavailableError();

  const session = (await response.json()) as AuthResponse;

  setAccessToken(session.accessToken);

  return session;
}

/**
 * Exchanges the refresh cookie for a new access token. Calls are shared
 * within a tab and serialized across tabs, because each refresh rotates
 * the cookie. Resolves null when there is no session.
 */
async function refreshWithLock(): Promise<AuthResponse | null> {
  let session: AuthResponse | null = null;

  await navigator.locks.request(REFRESH_LOCK_NAME, async () => {
    session = await requestRefresh();
  });

  return session;
}

export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= (
    typeof navigator !== "undefined" && "locks" in navigator ? refreshWithLock() : requestRefresh()
  ).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/** Ends the session on the server and in every tab. */
export async function endSession(): Promise<void> {
  try {
    await fetch(`${publicEnv.apiBaseUrl}/auth/sign-out`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Signing out locally still matters when the API is unreachable.
  } finally {
    setAccessToken(null);
    broadcastAuthChange({ type: "signed-out" });
  }
}
