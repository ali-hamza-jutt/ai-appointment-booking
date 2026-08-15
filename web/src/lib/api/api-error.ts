import {
  API_ERROR_MESSAGES,
  API_FIELD_ERROR_MESSAGES,
  DEFAULT_API_FIELD_ERROR_MESSAGE,
} from "./api-error.constants";

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getApiFieldError(
  error: unknown,
  fieldName: string,
  fallback = DEFAULT_API_FIELD_ERROR_MESSAGE,
): string | undefined {
  if (!isApiError(error) || !error.fieldErrors) return undefined;

  const fieldEntry = Object.entries(error.fieldErrors).find(
    ([key]) => key === fieldName || key.endsWith(`.${fieldName}`),
  );

  if (!fieldEntry) return undefined;

  return API_FIELD_ERROR_MESSAGES[error.code]?.[fieldName] ?? fallback;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!isApiError(error)) return fallback;

  return API_ERROR_MESSAGES[error.code] ?? fallback;
}
