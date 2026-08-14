import { clearAccessToken, getAccessToken } from "@/lib/auth/token-storage";
import { publicEnv } from "@/lib/config/public-env";

import { ApiError, type ApiErrorBody } from "./api-error";

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || !response.body) {
    return undefined;
  }

  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function toApiError(response: Response, body: unknown): ApiError {
  const apiBody = body as ApiErrorBody | undefined;
  const details = apiBody?.error;

  return new ApiError(
    response.status,
    details?.code ?? "REQUEST_FAILED",
    details?.message ?? "The request could not be completed",
    details?.fieldErrors,
    details?.requestId,
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
