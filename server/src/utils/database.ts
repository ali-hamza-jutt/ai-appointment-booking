import { DATABASE_ERROR_CODES } from "../constants/app.constants.js";

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
