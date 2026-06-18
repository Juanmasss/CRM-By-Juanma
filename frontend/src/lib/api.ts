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
export type CustomFieldType = "text" | "number" | "select" | "date";
export type SenderType = "contact" | "agent" | "bot";

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

export interface UserSummary {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
}

export interface ContactSummary {
  id?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  channel?: ChannelType | null;
  channelUserId?: string | null;
  channel_user_id?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
}

export interface CustomFieldDefinition {
  id: string;
  code: string;
  label: string;
  type: CustomFieldType;
  options?: string[] | null;
  position?: number | null;
}

export interface LeadCustomFieldValue {
  id?: string;
  fieldId?: string;
  field_id?: string;
  value?: string | null;
  field: CustomFieldDefinition;
}

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
}

export interface Conversation {
  id: string;
  leadId?: string | null;
  lead_id?: string | null;
  contactId?: string | null;
  contact_id?: string | null;
  channel?: Channel | null;
  status?: string | null;
  mode?: "bot" | "ai" | "human" | null;
  lastMessageAt?: string | null;
  last_message_at?: string | null;
}

export interface Message {
  id: string;
  conversationId?: string;
  conversation_id?: string;
  direction?: "inbound" | "outbound";
  senderType?: SenderType;
  sender_type?: SenderType;
  senderName?: string | null;
  sender_name?: string | null;
  body?: string | null;
  messageType?: string | null;
  message_type?: string | null;
  mediaUrl?: string | null;
  media_url?: string | null;
  status?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  due_at?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
}

export interface Lead {
  id: string;
  name?: string | null;
  title?: string | null;
  pipelineId?: string | null;
  pipeline_id?: string | null;
  stage_id?: string | null;
  stageId?: string | null;
  amount?: number | string | null;
  value?: number | string | null;
  channel?: ChannelType | { type?: ChannelType | null } | null;
  contact?: ContactSummary | null;
  tags?: LeadTag[] | { tag?: LeadTag | null }[];
  pipeline?: Pipeline | null;
  stage?: Stage | null;
  responsible?: UserSummary | null;
  responsibleUserId?: string | null;
  responsible_user_id?: string | null;
  source?: string | null;
  customFieldVals?: LeadCustomFieldValue[];
  custom_field_vals?: LeadCustomFieldValue[];
  conversations?: Conversation[];
  tasks?: Task[];
  last_activity_at?: string | null;
  lastActivityAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
}

export type LeadUpdateInput = Partial<Omit<Lead, "stage_id">> & {
  stage_id?: string | null;
  customFields?: Array<{ fieldId: string; value: string | null }>;
};

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

export async function updateLead(id: string, input: LeadUpdateInput) {
  const normalizedInput =
    input.stage_id && !input.stageId ? { ...input, stageId: input.stage_id } : input;
  return apiFetch<Lead>(`/api/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(normalizedInput),
  });
}

export async function getLead(id: string) {
  return apiFetch<Lead>(`/api/leads/${id}`);
}

export async function updateLeadCustomField(
  leadId: string,
  input: { fieldId: string; value: string | null },
) {
  try {
    return await apiFetch<Lead>(`/api/leads/${leadId}/custom-fields`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return updateLead(leadId, { customFields: [input] });
    }
    throw error;
  }
}

export async function addLeadTag(leadId: string, input: { name: string }) {
  return apiFetch<Lead>(`/api/leads/${leadId}/tags`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteLeadTag(leadId: string, input: { tagId: string }) {
  return apiFetch<Lead>(`/api/leads/${leadId}/tags`, {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

export async function updateContact(id: string, input: Partial<ContactSummary>) {
  return apiFetch<ContactSummary>(`/api/contacts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getConversationMessages(conversationId: string) {
  const response = await apiFetch<Message[] | { data?: Message[]; items?: Message[] }>(
    `/api/conversations/${conversationId}/messages`,
  );
  return unwrapList(response);
}

export async function sendConversationMessage(conversationId: string, input: { body: string }) {
  return apiFetch<Message>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createTask(input: { leadId: string; title: string }) {
  return apiFetch<Task>("/api/tasks", {
    method: "POST",
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
