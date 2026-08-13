import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestLogger } from "./middleware/request-logger.js";

export const app = express();

app.disable("x-powered-by");
app.use(requestLogger);
app.use(helmet());
app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "bookwise-server",
    timestamp: new Date().toISOString(),
  });
});

app.use(notFoundHandler);
app.use(errorHandler);
