/**
 * Where to go after signing in: the page's `next` parameter when it is a
 * path on this site, otherwise the booking chat. Call it in an effect or
 * event handler, since it reads the current URL.
 */
export function getNextPath(fallback = "/book"): string {
  if (typeof window === "undefined") return fallback;

  const next = new URLSearchParams(window.location.search).get("next");

  // Only local paths: "//host" or "/\host" would leave the site.
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
