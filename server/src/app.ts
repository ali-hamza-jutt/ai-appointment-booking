import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { swaggerRouter } from "./docs/swagger.js";
import { RegisterRoutes } from "./generated/routes.js";
import { invalidateAvailabilityOnWrite } from "./middleware/availability-invalidation.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import {
  authRateLimiter,
  chatRateLimiter,
  refreshRateLimiter,
  sensitiveAuthRateLimiter,
} from "./middleware/rate-limit.js";
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
app.post(
  [
    "/api/auth/signup",
    "/api/auth/sign-in",
    "/api/auth/phone/sign-in",
    "/api/auth/phone/link/verify",
    "/api/auth/password/reset",
  ],
  authRateLimiter,
);
app.post(
  [
    "/api/auth/password/forgot",
    "/api/auth/email/verification",
    "/api/auth/phone/link/code",
    "/api/auth/phone/sign-in/code",
  ],
  sensitiveAuthRateLimiter,
);
app.post("/api/auth/refresh", refreshRateLimiter);
app.post(
  [
    "/api/chat/sessions/:sessionId/messages",
    "/api/chat/sessions/:sessionId/confirm",
  ],
  chatRateLimiter,
);
app.use("/api/businesses/:businessId", invalidateAvailabilityOnWrite);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser(env.JWT_SECRET));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

RegisterRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);
