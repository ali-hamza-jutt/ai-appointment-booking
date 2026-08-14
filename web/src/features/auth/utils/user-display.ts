export function getUserInitials(fullName: string): string {
  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);

  return nameParts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
