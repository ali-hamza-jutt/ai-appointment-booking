import { TENANT_SCOPE_FIELDS } from "../../constants/app.constants.js";
import { Prisma } from "../../generated/prisma/client.js";

type TenantScopedModel = keyof typeof TENANT_SCOPE_FIELDS;

const WHERE_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

const CREATE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
]);

export class TenantScopeError extends Error {
  public constructor(model: string, operation: string) {
    super(
      `${model}.${operation} must be scoped by one of: ${TENANT_SCOPE_FIELDS[
        model as TenantScopedModel
      ].join(", ")}`,
    );
    this.name = "TenantScopeError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasScopeField(
  where: unknown,
  fields: readonly string[],
): boolean {
  if (!isRecord(where)) return false;

  if (fields.some((field) => where[field] !== undefined && where[field] !== null)) {
    return true;
  }

  // Compound unique inputs such as { userId_businessId: { userId, businessId } }.
  const compoundKeys = Object.keys(where).filter((key) => key.includes("_"));

  if (compoundKeys.some((key) => hasScopeField(where[key], fields))) {
    return true;
  }

  const conjunction = where.AND;
  const clauses = Array.isArray(conjunction) ? conjunction : [conjunction];

  return clauses.some((clause) => hasScopeField(clause, fields));
}

function createDataIsScoped(data: unknown): boolean {
  const rows = Array.isArray(data) ? data : [data];

  return rows.every(
    (row) =>
      isRecord(row) &&
      (typeof row.businessId === "string" ||
        (isRecord(row.business) && isRecord(row.business.connect))),
  );
}

function isTenantScopedModel(model: string): model is TenantScopedModel {
  return model in TENANT_SCOPE_FIELDS;
}

/**
 * Refuses tenant-owned queries that are not scoped by a tenant or owner key,
 * so a DAL cannot accidentally read or write across businesses.
 */
export const tenantScopeExtension = Prisma.defineExtension({
  name: "tenant-scope",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (isTenantScopedModel(model)) {
          const fields = TENANT_SCOPE_FIELDS[model];
          const input = args as { where?: unknown; data?: unknown };

          if (WHERE_OPERATIONS.has(operation) && !hasScopeField(input.where, fields)) {
            throw new TenantScopeError(model, operation);
          }

          if (CREATE_OPERATIONS.has(operation) && !createDataIsScoped(input.data)) {
            throw new TenantScopeError(model, operation);
          }
        }

        return query(args);
      },
    },
  },
});
