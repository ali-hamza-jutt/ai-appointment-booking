export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeFullName(fullName: string): string {
  return fullName.trim().replace(/\s+/g, " ");
}
