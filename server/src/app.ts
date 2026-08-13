import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { swaggerRouter } from "./docs/swagger.js";
import { RegisterRoutes } from "./generated/routes.js";
import { authRateLimiter } from "./middleware/auth-rate-limit.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestLogger } from "./middleware/request-logger.js";

export const app = express();

app.disable("x-powered-by");
app.use(requestLogger);
app.use("/docs", swaggerRouter);
app.use(helmet());
app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  }),
);
app.use(
  ["/api/auth/signup", "/api/auth/sign-in"],
  authRateLimiter,
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

RegisterRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);
