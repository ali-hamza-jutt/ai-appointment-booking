import type { Response } from "supertest";

/** The raw Set-Cookie line for `name`, if the response set one. */
export function setCookieLine(response: Response, name: string): string | undefined {
  const header = response.headers["set-cookie"] as unknown;
  const lines = Array.isArray(header) ? (header as string[]) : typeof header === "string" ? [header] : [];

  return lines.find((line) => line.startsWith(`${name}=`));
}

/** The cookie value set by the response, or undefined (empty when cleared). */
export function cookieValue(response: Response, name: string): string | undefined {
  const line = setCookieLine(response, name);

  return line ? decodeURIComponent(line.slice(name.length + 1).split(";")[0] ?? "") : undefined;
}

export function cookieHeader(name: string, value: string): [string, string] {
  return ["Cookie", `${name}=${encodeURIComponent(value)}`];
}
