import type { ErrorRequestHandler } from "express";

import { env } from "../config/env.js";
import { AppError } from "./app-error.js";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        requestId: request.id,
      },
    });
    return;
  }

  request.log.error({ err: error }, "Unhandled request error");

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        env.NODE_ENV === "production" && error instanceof Error
          ? "An unexpected error occurred"
          : error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      requestId: request.id,
    },
  });
};
