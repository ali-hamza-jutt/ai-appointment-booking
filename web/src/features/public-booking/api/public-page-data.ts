import { cache } from "react";

import type {
  PublicBusinessResponse,
  PublicReviewListResponse,
  PublicServiceListResponse,
} from "@/generated/api/models";
import { publicEnv } from "@/lib/config/public-env";

/** How long a rendered public page may be served before its data is fetched again. */
const REVALIDATE_SECONDS = 60;

async function getJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${publicEnv.apiBaseUrl}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);

  return (await response.json()) as T;
}

export interface PublicPageData {
  business: PublicBusinessResponse;
  services: PublicServiceListResponse["items"];
  reviews: PublicReviewListResponse;
}

/** Everything the public booking page shows, or null for an unknown link. Shared by the page and its metadata. */
export const loadPublicPage = cache(async (slug: string): Promise<PublicPageData | null> => {
  const base = `/public/${encodeURIComponent(slug)}`;
  const business = await getJson<PublicBusinessResponse>(base);

  if (!business) return null;

  const [services, reviews] = await Promise.all([
    getJson<PublicServiceListResponse>(`${base}/services`),
    getJson<PublicReviewListResponse>(`${base}/reviews`),
  ]);

  return {
    business,
    services: services?.items ?? [],
    reviews: reviews ?? { average: null, count: 0, items: [] },
  };
});
