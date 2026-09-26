import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { PrismaClient } from "../../generated/prisma/client.js";
import { tenantScopeExtension } from "./tenant-scope.extension.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter }).$extends(
  tenantScopeExtension,
);

export type DatabaseClient = typeof prisma;

export type TransactionClient = Parameters<
  Parameters<DatabaseClient["$transaction"]>[0]
>[0];

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info("PostgreSQL connection established");
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info("PostgreSQL connection closed");
}
