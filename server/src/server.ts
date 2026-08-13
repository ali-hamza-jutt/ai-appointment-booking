import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

const httpServer = app.listen(env.PORT, () => {
  logger.info(
    {
      environment: env.NODE_ENV,
      port: env.PORT,
    },
    "BookWise server started",
  );
});

httpServer.on("error", (error) => {
  logger.fatal({ err: error }, "Failed to start BookWise server");
  process.exitCode = 1;
});

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
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

  httpServer.close((error) => {
    clearTimeout(forceShutdownTimer);

    if (error) {
      logger.error({ err: error }, "HTTP server shutdown failed");
      process.exitCode = 1;
      return;
    }

    logger.info("BookWise server stopped");
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});
