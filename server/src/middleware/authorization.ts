import type { Request } from "express";

import {
  AUTHORIZATION_SCOPES,
  BUSINESS_CONSTANTS,
  ERROR_CODES,
  ERROR_MESSAGES,
  ROLE_SCOPES,
  VALIDATION_PATTERNS,
} from "../constants/app.constants.js";
import type { AuthenticatedUser } from "../models/authenticated-user.js";
import { businessDal } from "../modules/businesses/dal/business.dal.js";
import { AppError } from "./app-error.js";

function throwInsufficientScope(): never {
  throw new AppError(
    403,
    ERROR_CODES.INSUFFICIENT_SCOPE,
    ERROR_MESSAGES.INSUFFICIENT_SCOPE,
  );
}

function throwBusinessNotFound(): never {
  throw new AppError(
    404,
    ERROR_CODES.BUSINESS_NOT_FOUND,
    ERROR_MESSAGES.BUSINESS_NOT_FOUND,
  );
}

/**
 * Resolves the caller's role in the route's business and checks that the role
 * grants every requested scope. Platform admins pass every check.
 */
export async function authorizeScopes(
  request: Request,
  user: AuthenticatedUser,
  scopes: string[],
): Promise<AuthenticatedUser> {
  const isPlatformAdmin = await businessDal.isPlatformAdmin(user.id);
  const businessScopes = scopes.filter(
    (scope) => scope !== AUTHORIZATION_SCOPES.PLATFORM_ADMIN,
  );

  if (businessScopes.length < scopes.length && !isPlatformAdmin) {
    throwInsufficientScope();
  }

  if (businessScopes.length === 0) return user;

  const businessId = request.params[BUSINESS_CONSTANTS.BUSINESS_ID_PARAM];

  if (typeof businessId !== "string" || !VALIDATION_PATTERNS.UUID.test(businessId)) {
    throwBusinessNotFound();
  }

  const membership = await businessDal.findMembershipRole(user.id, businessId);

  if (!membership) {
    if (isPlatformAdmin) return { ...user, businessRole: null };

    // Non-members get 404 so business IDs cannot be probed.
    throwBusinessNotFound();
  }

  const grantedScopes: readonly string[] = ROLE_SCOPES[membership.role];

  if (
    !isPlatformAdmin &&
    !businessScopes.every((scope) => grantedScopes.includes(scope))
  ) {
    throwInsufficientScope();
  }

  return { ...user, businessRole: membership.role };
}
