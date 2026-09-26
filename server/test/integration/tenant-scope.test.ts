import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "../../src/infrastructure/database/prisma.js";
import { TenantScopeError } from "../../src/infrastructure/database/tenant-scope.extension.js";
import { disconnectTestDatabase } from "../helpers/database.js";

const businessId = "00000000-0000-4000-8000-000000000001";

describe("tenant scope extension", () => {
  afterAll(disconnectTestDatabase);

  it("rejects an unscoped read of a tenant-owned model", async () => {
    await expect(prisma.customer.findMany({})).rejects.toBeInstanceOf(
      TenantScopeError,
    );
  });

  it("rejects an unscoped update", async () => {
    await expect(
      prisma.location.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("rejects a create without a business", async () => {
    await expect(
      prisma.customer.create({ data: { name: "Nobody" } as never }),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("allows scoped queries, including scope nested in AND", async () => {
    await expect(prisma.customer.findMany({ where: { businessId } })).resolves.toEqual(
      expect.any(Array),
    );
    await expect(
      prisma.customer.count({ where: { AND: [{ businessId }, { name: "x" }] } }),
    ).resolves.toBe(0);
  });

  it("accepts the owner key for customer-side appointment reads", async () => {
    await expect(
      prisma.booking.findMany({
        where: { userId: "00000000-0000-4000-8000-000000000002" },
      }),
    ).resolves.toEqual([]);
  });
});

describe("tenant scope extension with compound keys", () => {
  afterAll(disconnectTestDatabase);

  it("accepts a compound unique key that contains a scope field", async () => {
    await expect(
      prisma.membership.findUnique({
        where: {
          userId_businessId: {
            userId: "00000000-0000-4000-8000-000000000002",
            businessId,
          },
        },
      }),
    ).resolves.toBeNull();
  });
});
