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

export type ChannelType = "whatsapp" | "instagram" | "facebook" | "tiktok";

export interface Pipeline {
  id: string;
  name: string;
  stages?: Stage[];
}

export interface Stage {
  id: string;
  pipeline_id?: string;
  pipelineId?: string;
  name: string;
  color?: string | null;
  position?: number | null;
  type?: string | null;
}

export interface LeadTag {
  id?: string;
  name: string;
  color?: string | null;
}

export interface Lead {
  id: string;
  name?: string | null;
  title?: string | null;
  stage_id?: string | null;
  stageId?: string | null;
  amount?: number | string | null;
  value?: number | string | null;
  channel?: ChannelType | { type?: ChannelType | null } | null;
  contact?: {
    name?: string | null;
    avatar_url?: string | null;
    avatarUrl?: string | null;
  } | null;
  tags?: LeadTag[] | { tag?: LeadTag | null }[];
  last_activity_at?: string | null;
  lastActivityAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
}

function unwrapList<T>(response: T[] | { data?: T[]; items?: T[] }): T[] {
  if (Array.isArray(response)) {
    return response;
  }

  return response.data ?? response.items ?? [];
}

export async function getPipelines() {
  const response = await apiFetch<Pipeline[] | { data?: Pipeline[]; items?: Pipeline[] }>(
    "/api/pipelines",
  );
  return unwrapList(response);
}

export async function createPipeline(input: { name: string }) {
  return apiFetch<Pipeline>("/api/pipelines", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getLeads(params: { pipelineId?: string; stageId?: string; search?: string }) {
  const searchParams = new URLSearchParams();

  if (params.pipelineId) {
    searchParams.set("pipelineId", params.pipelineId);
  }
  if (params.stageId) {
    searchParams.set("stageId", params.stageId);
  }
  if (params.search) {
    searchParams.set("search", params.search);
  }

  const query = searchParams.toString();
  const response = await apiFetch<Lead[] | { data?: Lead[]; items?: Lead[] }>(
    `/api/leads${query ? `?${query}` : ""}`,
  );
  return unwrapList(response);
}

export async function updateLead(id: string, input: Partial<Lead> & { stage_id?: string }) {
  return apiFetch<Lead>(`/api/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createStage(pipelineId: string, input: Pick<Stage, "name" | "color" | "type">) {
  return apiFetch<Stage>(`/api/pipelines/${pipelineId}/stages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateStage(id: string, input: Pick<Stage, "name" | "color" | "type">) {
  return apiFetch<Stage>(`/api/stages/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteStage(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/stages/${id}`, {
    method: "DELETE",
  });
}

export async function reorderStages(
  pipelineId: string,
  input: Array<{ stageId: string; position: number }>,
) {
  return apiFetch<{ ok: boolean }>(`/api/pipelines/${pipelineId}/stages/reorder`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
