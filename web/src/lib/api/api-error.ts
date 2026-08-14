export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string[]>;
    requestId?: string;
  };
}

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
): string | undefined {
  if (!isApiError(error) || !error.fieldErrors) return undefined;

  const fieldEntry = Object.entries(error.fieldErrors).find(
    ([key]) => key === fieldName || key.endsWith(`.${fieldName}`),
  );

  return fieldEntry?.[1]?.[0];
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}
