import { clearAccessToken, getAccessToken } from "@/lib/auth/token-storage";
import { publicEnv } from "@/lib/config/public-env";

import { ApiError } from "./api-error";

async function readResponseBody(response: Response): Promise<unknown> {
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

function toApiError(response: Response, body: unknown): ApiError {
  const details = isRecord(body) && isRecord(body.error) ? body.error : null;

  return new ApiError(
    response.status,
    getOptionalString(details?.code, "REQUEST_FAILED"),
    getOptionalString(details?.message, "The request could not be completed"),
    getFieldErrors(details?.fieldErrors),
    typeof details?.requestId === "string" ? details.requestId : undefined,
  );
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${publicEnv.apiBaseUrl}${path}`, {
    ...options,
    headers,
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    if (response.status === 401) {
      clearAccessToken();
    }

    throw toApiError(response, body);
  }

  return body as T;
}

export type ErrorType<Error> = ApiError & { payload?: Error };
export type BodyType<BodyData> = BodyData;
