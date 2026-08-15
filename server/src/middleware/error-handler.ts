import type { ErrorRequestHandler } from "express";
import { ValidateError } from "@tsoa/runtime";

import {
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from "../constants/app.constants.js";
import { AppError } from "./app-error.js";

function hasErrorProperty(
  error: unknown,
  property: string,
  expectedValue: string | number,
): boolean {
  const errorRecord = error as Record<string, unknown>;

  return (
    typeof error === "object" &&
    error !== null &&
    property in error &&
    errorRecord[property] === expectedValue
  );
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  if (hasErrorProperty(error, "type", "entity.parse.failed")) {
    request.log.warn("Request body contained invalid JSON");
    response.status(400).json({
      error: {
        code: ERROR_CODES.INVALID_JSON_BODY,
        message: ERROR_MESSAGES.INVALID_JSON_BODY,
        requestId: request.id,
      },
    });
    return;
  }

  if (
    hasErrorProperty(error, "type", "entity.too.large") ||
    hasErrorProperty(error, "status", 413)
  ) {
    request.log.warn("Request body exceeded the configured size limit");
    response.status(413).json({
      error: {
        code: ERROR_CODES.REQUEST_BODY_TOO_LARGE,
        message: ERROR_MESSAGES.REQUEST_BODY_TOO_LARGE,
        requestId: request.id,
      },
    });
    return;
  }

  if (error instanceof ValidateError) {
    const fieldErrors = Object.fromEntries(
      Object.keys(error.fields).map((field) => [
        field,
        [VALIDATION_MESSAGES.REQUEST_FIELD],
      ]),
    );

    request.log.warn(
      { fields: Object.keys(fieldErrors) },
      "Request validation failed",
    );

    response.status(422).json({
      error: {
        code: ERROR_CODES.REQUEST_VALIDATION_FAILED,
        message: ERROR_MESSAGES.REQUEST_VALIDATION_FAILED,
        fieldErrors,
        requestId: request.id,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      request.log.error(
        { code: error.code, statusCode: error.statusCode },
        "Request failed with a handled server error",
      );
    }

    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        requestId: request.id,
      },
    });
    return;
  }

  request.log.error({ err: error }, "Unhandled request error");

  response.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      requestId: request.id,
    },
  });
};
