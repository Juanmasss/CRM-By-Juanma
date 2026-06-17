// API client pointing at the backend (API_URL). Override with VITE_API_URL.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new ApiError(`Request failed: ${path}`, res.status);
  }

  return (await res.json()) as T;
}

export interface HealthResponse {
  ok: boolean;
}

export function getHealth() {
  return apiFetch<HealthResponse>("/health");
}

export function useApi() {
  return {
    fetch: apiFetch,
  };
}
