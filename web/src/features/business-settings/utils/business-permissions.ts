import type { MembershipRole } from "@/generated/api/models";

export function canManageBusiness(role: MembershipRole | null | undefined): boolean {
  return role === "OWNER" || role === "MANAGER";
}

export function isBusinessOwner(role: MembershipRole | null | undefined): boolean {
  return role === "OWNER";
}
