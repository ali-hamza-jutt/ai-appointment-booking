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
      void shutdown("SIGTERM");
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

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

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
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});

void startServer();
