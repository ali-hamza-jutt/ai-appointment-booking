import { API_URL } from "../playwright.config";

async function call<T>(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} failed with ${response.status}`);

  return (response.status === 204 ? undefined : await response.json()) as T;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** A salon open every day 09:00–17:00 UTC with one bookable haircut. */
export async function createBookableBusiness(): Promise<{ id: string; slug: string; name: string; ownerToken: string }> {
  const { accessToken: token } = await call<{ accessToken: string }>("/auth/signup", {
    method: "POST",
    body: { fullName: "Olivia Owner", email: uniqueEmail("owner"), password: "Password123" },
  });
  const name = `E2E Salon ${Date.now()}`;
  const business = await call<{ id: string; slug: string }>("/businesses", {
    method: "POST",
    token,
    body: { name, vertical: "SALON", timeZone: "UTC", currency: "USD" },
  });

  await call(`/businesses/${business.id}/settings`, {
    method: "PATCH",
    token,
    body: { minimumNoticeMinutes: 0, slotStepMinutes: 30, cancellationWindowHours: 0 },
  });

  const service = await call<{ id: string }>(`/businesses/${business.id}/services`, {
    method: "POST",
    token,
    body: { name: "Haircut", durationMinutes: 60, priceMinor: 3_000 },
  });
  const staff = await call<{ id: string }>(`/businesses/${business.id}/staff`, {
    method: "POST",
    token,
    body: { displayName: "Sana", services: [{ serviceId: service.id }] },
  });

  await call(`/businesses/${business.id}/staff/${staff.id}/working-hours`, {
    method: "PUT",
    token,
    body: {
      items: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })),
    },
  });

  return { id: business.id, slug: business.slug, name, ownerToken: token };
}

/** Lets a website embed the business's booking widget. */
export async function allowWidgetOn(business: { id: string; ownerToken: string }, origin: string): Promise<void> {
  await call(`/businesses/${business.id}/allowed-origins`, { method: "POST", token: business.ownerToken, body: { origin } });
}
