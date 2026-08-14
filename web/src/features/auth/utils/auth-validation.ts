export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function getPasswordRequirements(password: string) {
  return [
    { label: "8+ characters", valid: password.length >= 8 },
    { label: "1 uppercase", valid: /[A-Z]/.test(password) },
    { label: "1 lowercase", valid: /[a-z]/.test(password) },
    { label: "1 number", valid: /\d/.test(password) },
  ];
}
