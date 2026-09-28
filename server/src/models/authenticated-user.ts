export type AuthenticatedBusinessRole = "OWNER" | "MANAGER" | "STAFF";

export interface AuthenticatedUser {
  id: string;
  email: string;
  /** Set when a platform admin is acting as this user. */
  impersonatorId?: string;
  /** Role in the business named by the route, once scopes are authorized. */
  businessRole?: AuthenticatedBusinessRole | null;
}
