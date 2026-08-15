import type { RequestHandler } from "express";

import { ERROR_CODES, ERROR_MESSAGES } from "../constants/app.constants.js";
import { AppError } from "./app-error.js";

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(
    new AppError(
      404,
      ERROR_CODES.ROUTE_NOT_FOUND,
      ERROR_MESSAGES.ROUTE_NOT_FOUND,
    ),
  );
};
