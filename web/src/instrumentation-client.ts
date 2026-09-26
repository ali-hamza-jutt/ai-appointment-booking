import { initErrorReporting } from "@/lib/observability/error-reporting";

// Runs before the app becomes interactive, so early errors are reported too.
try {
  initErrorReporting();
} catch {
  // Monitoring must never stop the app from loading.
}
