import { randomUUID } from "node:crypto";

import { pinoHttp } from "pino-http";

import { logger } from "../config/logger.js";

export const requestLogger = pinoHttp({
  logger,
  genReqId(request, response) {
    const requestIdHeader = request.headers["x-request-id"];
    const requestId =
      typeof requestIdHeader === "string" && requestIdHeader.length > 0
        ? requestIdHeader
        : randomUUID();

    response.setHeader("x-request-id", requestId);
    return requestId;
  },
  customLogLevel(_request, response, error) {
    if (error || response.statusCode >= 500) {
      return "error";
    }

    if (response.statusCode >= 400) {
      return "warn";
    }

    return "info";
  },
});
