import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/config/public-env";

const WEB_ORIGIN_PATTERN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;

/** The websites a business allows to embed its widget; none when the lookup fails. */
async function allowedOrigins(slug: string): Promise<string[]> {
  try {
    const response = await fetch(`${publicEnv.apiBaseUrl}/public/${encodeURIComponent(slug)}/embed`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

    if (!response.ok) return [];

    const body = (await response.json()) as { origins?: unknown };

    // Checked again here, since the value goes straight into a header.
    return Array.isArray(body.origins)
      ? body.origins.filter((origin): origin is string => typeof origin === "string" && WEB_ORIGIN_PATTERN.test(origin))
      : [];
  } catch {
    return [];
  }
}

/**
 * The widget's page may only be framed by the business's own websites (and
 * BookWise itself), so another site can't wrap it to trick visitors.
 */
export async function proxy(request: NextRequest) {
  const slug = request.nextUrl.pathname.split("/")[2] ?? "";
  const origins = slug ? await allowedOrigins(slug) : [];
  const response = NextResponse.next();

  response.headers.set("Content-Security-Policy", `frame-ancestors 'self' ${origins.join(" ")}`.trim());

  return response;
}

export const config = {
  matcher: "/embed/:slug*",
};
