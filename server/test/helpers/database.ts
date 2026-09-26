import { BUSINESS_CONSTANTS } from "../../src/constants/app.constants.js";
import { prisma } from "../../src/infrastructure/database/prisma.js";

export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT "tablename"
    FROM "pg_tables"
    WHERE "schemaname" = 'public'
      AND "tablename" <> '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  const tableList = tables
    .map(({ tablename }) => `"public"."${tablename}"`)
    .join(", ");

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
  await seedDemoBusiness();
}

/** Recreates the demo business that the tenancy migration seeds. */
async function seedDemoBusiness(): Promise<void> {
  await prisma.business.create({
    data: {
      id: BUSINESS_CONSTANTS.DEMO_BUSINESS_ID,
      slug: "bookwise-demo",
      name: "BookWise Demo",
      vertical: "CONSULTANT",
      timeZone: "UTC",
      currency: "USD",
    },
  });
}

export async function disconnectTestDatabase(): Promise<void> {
  await prisma.$disconnect();
}
