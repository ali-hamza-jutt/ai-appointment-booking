export type AuthenticatedBusinessRole = "OWNER" | "MANAGER" | "STAFF";

export interface AuthenticatedUser {
  id: string;
  email: string;
  /** Role in the business named by the route, once scopes are authorized. */
  businessRole?: AuthenticatedBusinessRole | null;
}
