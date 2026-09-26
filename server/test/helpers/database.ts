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
}

export async function disconnectTestDatabase(): Promise<void> {
  await prisma.$disconnect();
}
