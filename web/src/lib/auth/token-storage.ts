const ACCESS_TOKEN_STORAGE_KEY = "bookwise.access-token";
const ACCESS_TOKEN_CHANGED_EVENT = "bookwise:access-token-changed";

export type AccessTokenPersistence = "local" | "session";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ??
    window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  );
}

export function setAccessToken(
  token: string,
  persistence: AccessTokenPersistence,
): void {
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);

  const storage =
    persistence === "local" ? window.localStorage : window.sessionStorage;
  storage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  window.dispatchEvent(new Event(ACCESS_TOKEN_CHANGED_EVENT));
}

export function clearAccessToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    window.dispatchEvent(new Event(ACCESS_TOKEN_CHANGED_EVENT));
  }
}

export function subscribeToAccessTokenChanges(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === ACCESS_TOKEN_STORAGE_KEY) listener();
  };
  const handleLocalChange = () => listener();

  window.addEventListener("storage", handleStorageChange);
  window.addEventListener(ACCESS_TOKEN_CHANGED_EVENT, handleLocalChange);

  return () => {
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener(ACCESS_TOKEN_CHANGED_EVENT, handleLocalChange);
  };
}
