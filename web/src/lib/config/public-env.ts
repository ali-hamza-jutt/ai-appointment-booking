const DEFAULT_API_BASE_URL = "http://localhost:4000/api";

export const publicEnv = {
  apiBaseUrl:
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
    DEFAULT_API_BASE_URL,
} as const;
