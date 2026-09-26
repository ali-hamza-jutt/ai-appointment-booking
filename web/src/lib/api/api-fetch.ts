import { getAccessToken, refreshSession, setAccessToken } from "@/lib/auth/session";
import { publicEnv } from "@/lib/config/public-env";

import { ApiError } from "./api-error";

export async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || !response.body) {
    return undefined;
  }

  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOptionalString(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function getFieldErrors(
  value: unknown,
): Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined;

  const entries = Object.entries(value).flatMap(([field, messages]) => {
    if (
      !Array.isArray(messages) ||
      !messages.every((message) => typeof message === "string")
    ) {
      return [];
    }

    return [[field, messages] as const];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function toApiError(response: Response, body: unknown): ApiError {
  const details = isRecord(body) && isRecord(body.error) ? body.error : null;

  return new ApiError(
    response.status,
    getOptionalString(details?.code, "REQUEST_FAILED"),
    getOptionalString(details?.message, "The request could not be completed"),
    getFieldErrors(details?.fieldErrors),
    typeof details?.requestId === "string" ? details.requestId : undefined,
  );
}

function send(
  path: string,
  options: RequestInit,
  token: string | null,
  accept: string,
): Promise<Response> {
  const headers = new Headers(options.headers);

  headers.set("Accept", accept);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${publicEnv.apiBaseUrl}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
}

/**
 * Sends a request with the in-memory access token. A request made with a
 * token that gets 401 means the token expired, so refresh once and retry;
 * tokenless 401s (wrong password) are final.
 */
export async function sendAuthenticated(
  path: string,
  options: RequestInit = {},
  accept = "application/json",
): Promise<Response> {
  const token = getAccessToken();
  let response = await send(path, options, token, accept);

  if (response.status === 401 && token) {
    const session = await refreshSession().catch(() => null);

    if (session) response = await send(path, options, session.accessToken, accept);
    else setAccessToken(null);
  }

  return response;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await sendAuthenticated(path, options);
  const body = await readResponseBody(response);

  if (!response.ok) {
    if (response.status === 401) setAccessToken(null);

    throw toApiError(response, body);
  }

  return body as T;
}

export type ErrorType<Error> = ApiError & { payload?: Error };
export type BodyType<BodyData> = BodyData;
