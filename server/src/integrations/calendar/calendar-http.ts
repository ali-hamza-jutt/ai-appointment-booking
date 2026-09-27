import { CALENDAR_CONSTANTS } from "../../constants/app.constants.js";
import type { CalendarProviderName } from "./calendar.dto.js";

/**
 * auth: the grant is no longer valid and the person must connect again.
 * transient: worth retrying later. rejected: the request itself was refused.
 */
export type CalendarErrorKind = "auth" | "transient" | "rejected";

export class CalendarApiError extends Error {
  public constructor(
    message: string,
    public readonly kind: CalendarErrorKind,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "CalendarApiError";
  }
}

export interface CalendarRequest {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  accessToken?: string;
  json?: unknown;
  form?: Record<string, string>;
  headers?: Record<string, string>;
  /** Statuses returned to the caller instead of thrown, such as 404 for a deleted event. */
  allow?: readonly number[];
}

export interface CalendarResponse<T> {
  status: number;
  data: T | null;
}

function errorKind(status: number, body: unknown): CalendarErrorKind {
  const code = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;

  if (status === 401 || code === "invalid_grant") return "auth";
  if (status === 408 || status === 429 || status >= 500) return "transient";

  return "rejected";
}

function describe(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";

  const error = (body as { error?: unknown; error_description?: unknown }).error;
  const description = (body as { error_description?: unknown }).error_description;

  if (typeof description === "string") return description;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") return message;
  }

  return "";
}

function parseJson(text: string): unknown {
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

/** One request to a provider's OAuth or Calendar API. */
export async function calendarRequest<T>(
  provider: CalendarProviderName,
  url: string,
  request: CalendarRequest = {},
): Promise<CalendarResponse<T>> {
  const headers: Record<string, string> = { Accept: "application/json", ...request.headers };
  let body: string | undefined;

  if (request.accessToken) headers.Authorization = `Bearer ${request.accessToken}`;
  if (request.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(request.json);
  } else if (request.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(request.form).toString();
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: request.method ?? (body === undefined ? "GET" : "POST"),
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(CALENDAR_CONSTANTS.REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new CalendarApiError(
      `${provider} calendar request failed: ${error instanceof Error ? error.message : "network error"}`,
      "transient",
    );
  }

  const data = parseJson(await response.text());

  if (response.ok || request.allow?.includes(response.status)) {
    return { status: response.status, data: data as T | null };
  }

  const detail = describe(data);

  throw new CalendarApiError(
    `${provider} calendar returned ${response.status}${detail ? `: ${detail}` : ""}`,
    errorKind(response.status, data),
    response.status,
  );
}

/** The payload of a JWT, without checking the signature. Only for tokens received straight from the provider over TLS. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];

    return payload ? (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
