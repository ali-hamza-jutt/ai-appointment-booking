"use client";

import { useEffect } from "react";

import { reportError } from "./error-reporting";

/** Reports the error an error boundary caught, once per error. */
export function useReportError(error: Error & { digest?: string }): void {
  useEffect(() => {
    reportError(error, error.digest);
  }, [error]);
}
