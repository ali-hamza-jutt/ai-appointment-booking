import { Router } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

import { openApiDocument } from "./openapi.js";

export const swaggerRouter = Router();

swaggerRouter.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
      },
    },
  }),
);

swaggerRouter.use(swaggerUi.serve);
swaggerRouter.get(
  "/",
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: "BookWise AI API Documentation",
    swaggerOptions: {
      displayRequestDuration: true,
    },
  }),
);
