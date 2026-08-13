import type { ErrorRequestHandler } from "express";
import { ValidateError } from "@tsoa/runtime";

import { env } from "../config/env.js";
import { ERROR_CODES, ERROR_MESSAGES } from "../constants/app.constants.js";
import { AppError } from "./app-error.js";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  if (error instanceof ValidateError) {
    const fieldErrors = Object.fromEntries(
      Object.entries(error.fields).map(([field, details]) => [
        field,
        [details.message],
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
      message:
        env.NODE_ENV === "production" && error instanceof Error
          ? ERROR_MESSAGES.INTERNAL_SERVER_ERROR
          : error instanceof Error
            ? error.message
            : ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      requestId: request.id,
    },
  });
};
