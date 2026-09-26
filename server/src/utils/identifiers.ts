import { VALIDATION_MESSAGES, VALIDATION_PATTERNS } from "../constants/app.constants.js";
import { throwRequestValidationError } from "./validation.js";

export function assertUuid(field: string, value: string): void {
  if (!VALIDATION_PATTERNS.UUID.test(value)) {
    throwRequestValidationError(field, VALIDATION_MESSAGES.RESOURCE_ID);
  }
}
