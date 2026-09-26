import { AsyncLocalStorage } from "node:async_hooks";

import { trace } from "@opentelemetry/api";
import type { NextFunction, Request, Response } from "express";

import { OBSERVABILITY_CONSTANTS } from "../../constants/app.constants.js";

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The id of the HTTP request (or outbox event) this code is running for. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function runWithRequestId<Result>(requestId: string, work: () => Result): Result {
  return storage.run({ requestId }, work);
}

/**
 * Makes the request id available to everything the request triggers, and
 * tags the HTTP span with it so logs, traces and errors can be joined.
 */
export function requestContext(request: Request, _response: Response, next: NextFunction): void {
  const requestId = String(request.id);

  trace.getActiveSpan()?.setAttribute(OBSERVABILITY_CONSTANTS.REQUEST_ID_ATTRIBUTE, requestId);
  storage.run({ requestId }, next);
}
