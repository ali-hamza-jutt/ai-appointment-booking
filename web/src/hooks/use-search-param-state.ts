"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";

/** Which values a parameter accepts: a fixed list, or a check such as a date pattern. */
export type SearchParamAccepts<T extends string> = readonly T[] | ((value: string) => boolean);

/** The parameter's value when it is one the page accepts, otherwise the default. */
export function readSearchParam<T extends string>(
  params: Pick<URLSearchParams, "get">,
  key: string,
  defaultValue: T,
  accepts: SearchParamAccepts<T>,
): T {
  const value = params.get(key);

  if (value === null) return defaultValue;

  const isAccepted = typeof accepts === "function" ? accepts(value) : (accepts as readonly string[]).includes(value);

  return isAccepted ? (value as T) : defaultValue;
}

/** The URL with one parameter set, or removed when the value is null or empty. */
export function withSearchParam(href: string, key: string, value: string | null): string {
  const url = new URL(href);

  if (value) {
    url.searchParams.set(key, value);
  } else {
    url.searchParams.delete(key);
  }

  return url.href;
}

function replaceSearchParam(key: string, value: string | null): void {
  const next = withSearchParam(window.location.href, key, value);

  // Next.js keeps useSearchParams in step with history.replaceState, without a navigation.
  if (next !== window.location.href) window.history.replaceState(window.history.state, "", next);
}

/**
 * A filter kept in the page's query string, so a filtered view survives a
 * reload and can be shared. The default stays out of the URL. Pages using
 * it render inside a Suspense boundary, as useSearchParams requires.
 */
export function useSearchParamState<T extends string>(
  key: string,
  defaultValue: T,
  accepts: SearchParamAccepts<T>,
): [T, (value: T) => void] {
  const searchParams = useSearchParams();
  const value = readSearchParam(searchParams, key, defaultValue, accepts);
  const setValue = useCallback(
    (next: T) => replaceSearchParam(key, next === defaultValue ? null : next),
    [defaultValue, key],
  );

  return [value, setValue];
}

/**
 * A search box kept in the query string. The box updates as the person
 * types; the URL, and the returned `query`, follow once they pause.
 */
export function useSearchParamQuery(key: string, delayMs: number) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get(key) ?? "");
  const query = useDebouncedValue(search.trim(), delayMs);

  useEffect(() => {
    replaceSearchParam(key, query || null);
  }, [key, query]);

  return { search, setSearch, query };
}

/** Accepts a calendar date such as 2030-01-31. */
export function isDateParam(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
