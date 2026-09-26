import type { NextFunction, Request, Response } from "express";

import { availabilityCache } from "../modules/availability/availability-cache.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Business areas whose changes can never move an open slot. */
const UNRELATED_PATHS = ["/customers", "/members", "/invitations"];

/**
 * Drops a business's cached availability after any successful staff-side
 * change to its schedule, catalog, team or bookings.
 */
export function invalidateAvailabilityOnWrite(
  request: Request<{ businessId: string }>,
  response: Response,
  next: NextFunction,
): void {
  const { businessId } = request.params;
  const isUnrelated = UNRELATED_PATHS.some((path) => request.path.startsWith(path));

  if (!READ_METHODS.has(request.method) && !isUnrelated) {
    response.on("finish", () => {
      if (response.statusCode < 400) void availabilityCache.invalidate(businessId);
    });
  }

  next();
}
