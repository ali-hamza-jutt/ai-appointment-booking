import {
  BOOKING_CONSTANTS,
  DATABASE_ERROR_CODES,
} from "../constants/app.constants.js";

const EXCLUSION_VIOLATION_CODE = BOOKING_CONSTANTS.EXCLUSION_VIOLATION_CODE;

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === DATABASE_ERROR_CODES.UNIQUE_CONSTRAINT
  );
}

export function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === DATABASE_ERROR_CODES.RECORD_NOT_FOUND
  );
}

/** True for a PostgreSQL exclusion-constraint violation (SQLSTATE 23P01), however the driver wraps it. */
export function isExclusionViolationError(error: unknown, depth = 0): boolean {
  if (typeof error !== "object" || error === null || depth > 4) return false;

  const record = error as Record<string, unknown>;

  if (
    record.code === EXCLUSION_VIOLATION_CODE ||
    (typeof record.message === "string" && record.message.includes(EXCLUSION_VIOLATION_CODE))
  ) {
    return true;
  }

  return ["meta", "cause", "originalError"].some((key) =>
    isExclusionViolationError(record[key], depth + 1),
  );
}
