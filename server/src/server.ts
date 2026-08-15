import type { Server } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./infrastructure/database/prisma.js";

let httpServer: Server | undefined;
let isShuttingDown = false;

type ShutdownReason =
  | NodeJS.Signals
  | "HTTP_SERVER_ERROR"
  | "UNHANDLED_REJECTION";

async function startServer(): Promise<void> {
  try {
    await connectDatabase();

    httpServer = app.listen(env.PORT, () => {
      logger.info(
        {
          environment: env.NODE_ENV,
          port: env.PORT,
        },
        "BookWise server started",
      );
    });

    httpServer.on("error", (error) => {
      logger.fatal({ err: error }, "BookWise HTTP server error");
      void shutdown("HTTP_SERVER_ERROR", 1);
    });
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start BookWise server");
    await disconnectDatabase().catch((disconnectError: unknown) => {
      logger.error({ err: disconnectError }, "Database cleanup failed");
    });
    process.exitCode = 1;
  }
}

async function closeHttpServer(): Promise<void> {
  if (!httpServer) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    httpServer?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function shutdown(reason: ShutdownReason, exitCode = 0): Promise<void> {
  const currentExitCode =
    typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = Math.max(currentExitCode, exitCode);

  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ reason }, "Graceful shutdown started");

  const forceShutdownTimer = setTimeout(() => {
    logger.fatal("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);

  forceShutdownTimer.unref();

  try {
    await closeHttpServer();
    await disconnectDatabase();
    logger.info("BookWise server stopped");
  } catch (error) {
    logger.error({ err: error }, "BookWise server shutdown failed");
    process.exitCode = 1;
  } finally {
    clearTimeout(forceShutdownTimer);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  void shutdown("UNHANDLED_REJECTION", 1);
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});

void startServer();
