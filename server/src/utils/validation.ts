import {
  ERROR_CODES,
  ERROR_MESSAGES,
} from "../constants/app.constants.js";
import { AppError } from "../middleware/app-error.js";

export function throwRequestValidationError(
  field: string,
  message: string,
): never {
  throw new AppError(
    422,
    ERROR_CODES.REQUEST_VALIDATION_FAILED,
    ERROR_MESSAGES.REQUEST_VALIDATION_FAILED,
    { [field]: [message] },
  );
}
