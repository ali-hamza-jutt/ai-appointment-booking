/**
 * Loaded with `node --import` before the app so OpenTelemetry can patch
 * http, express, pg, ioredis and Prisma as they are first imported.
 */
import { register } from "node:module";

import { startTelemetry } from "./infrastructure/observability/telemetry.js";

register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

startTelemetry(process.argv.some((argument) => argument.includes("worker")) ? "worker" : "api");
