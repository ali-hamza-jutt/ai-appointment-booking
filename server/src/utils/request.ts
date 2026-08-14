import type { Request } from "express";

import type { AuthenticatedUser } from "../models/authenticated-user.js";

export function getAuthenticatedUser(request: Request): AuthenticatedUser {
  return (request as Request & { user: AuthenticatedUser }).user;
}
