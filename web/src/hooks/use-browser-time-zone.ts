"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const getServerTimeZone = () => "UTC";

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function useBrowserTimeZone() {
  return useSyncExternalStore(
    subscribe,
    getBrowserTimeZone,
    getServerTimeZone,
  );
}
