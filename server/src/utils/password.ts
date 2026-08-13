import argon2 from "argon2";

import { AUTH_CONSTANTS } from "../constants/app.constants.js";

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= AUTH_CONSTANTS.MIN_PASSWORD_LENGTH &&
    password.length <= AUTH_CONSTANTS.MAX_PASSWORD_LENGTH &&
    AUTH_CONSTANTS.PASSWORD_PATTERN.test(password)
  );
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: AUTH_CONSTANTS.ARGON2_MEMORY_COST_KIB,
    timeCost: AUTH_CONSTANTS.ARGON2_TIME_COST,
    parallelism: AUTH_CONSTANTS.ARGON2_PARALLELISM,
  });
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return argon2.verify(passwordHash, password);
}
