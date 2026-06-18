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

export async function getDashboard(): Promise<DashboardResponse> {
  const response = await apiFetch<DashboardResponse | { data?: DashboardResponse }>("/api/dashboard");
  if ("data" in response && response.data) {
    return response.data;
  }
  return response as DashboardResponse;
}

export async function getReports(
  params: { from?: string; to?: string; pipelineId?: string } = {},
): Promise<ReportsResponse> {
  const searchParams = new URLSearchParams();
  if (params.from) {
    searchParams.set("from", params.from);
  }
  if (params.to) {
    searchParams.set("to", params.to);
  }
  if (params.pipelineId) {
    searchParams.set("pipelineId", params.pipelineId);
  }
  const query = searchParams.toString();
  const response = await apiFetch<ReportsResponse | { data?: ReportsResponse }>(
    `/api/reports${query ? `?${query}` : ""}`,
  );
  if ("data" in response && response.data) {
    return response.data;
  }
  return response as ReportsResponse;
}

export function useApi() {
  return {
    fetch: apiFetch,
  };
}

export type ChannelType = "whatsapp" | "instagram" | "facebook" | "tiktok";
export type CustomFieldType = "text" | "number" | "select" | "date";
export type SenderType = "contact" | "agent" | "bot";
export type TaskType = "task" | "call" | "email" | "meeting" | "whatsapp";
export type TaskStatus = "pending" | "overdue" | "completed";
export type ConversationMode = "bot" | "ai" | "human";
export type BotStatus = "active" | "inactive";
export type BotNodeType =
  | "message"
  | "reaction"
  | "comment"
  | "internal_message"
  | "list_message"
  | "pause"
  | "subscribe_meta"
  | "actions"
  | "condition"
  | "validation"
  | "goto"
  | "start_salesbot"
  | "custom_code"
  | "widget"
  | "round_robin"
  | "stop";

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
  company?: CompanySummary | null;
  leads?: Lead[];
  conversations?: Conversation[];
  _count?: { leads?: number; contacts?: number };
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
}

export interface CompanySummary {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  totalValue?: number | string | null;
  total_value?: number | string | null;
  dealsValue?: number | string | null;
  deals_value?: number | string | null;
  contacts?: ContactSummary[];
  leads?: Lead[];
  _count?: { contacts?: number; leads?: number };
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
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
  contact?: ContactSummary | null;
  lead?: Pick<Lead, "id" | "name" | "title" | "stageId" | "stage_id"> | null;
  channel?: Channel | null;
  status?: string | null;
  mode?: ConversationMode | null;
  lastMessageAt?: string | null;
  last_message_at?: string | null;
  messages?: Message[];
  _count?: { messages?: number };
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
  leadId?: string | null;
  lead_id?: string | null;
  type?: TaskType;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  due_at?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
  assignedToUserId?: string | null;
  assigned_to_user_id?: string | null;
  assignedTo?: UserSummary | null;
  assigned_to?: UserSummary | null;
  lead?: Pick<Lead, "id" | "name" | "title" | "contact"> | null;
  createdAt?: string | null;
  created_at?: string | null;
}

export interface TaskInput {
  title: string;
  type?: TaskType;
  description?: string | null;
  leadId?: string | null;
  assignedToUserId?: string | null;
  dueAt?: string | null;
  completed?: boolean;
}

export interface BotFlowNode {
  id: string;
  type: BotNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface BotFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  label?: string | null;
}

export interface BotFlowGraph {
  nodes: BotFlowNode[];
  edges: BotFlowEdge[];
}

export interface BotFlow {
  id?: string;
  botId?: string;
  bot_id?: string;
  graph?: BotFlowGraph | null;
}

export interface BotSummary {
  id: string;
  name: string;
  status?: BotStatus | string | null;
  triggerType?: string | null;
  trigger_type?: string | null;
  triggerConfig?: unknown;
  trigger_config?: unknown;
  conversionRate?: number | string | null;
  conversion_rate?: number | string | null;
  launches?: number | string | null;
  activeSessions?: number | string | null;
  active_sessions?: number | string | null;
  flow?: BotFlow | null;
  _count?: { sessions?: number };
  createdAt?: string | null;
  created_at?: string | null;
}

export interface DashboardMetric {
  value?: number | string | null;
  total?: number | string | null;
  count?: number | string | null;
  change?: number | string | null;
  variation?: number | string | null;
  variationPercent?: number | string | null;
  variation_percent?: number | string | null;
}

export interface DashboardMonthPoint {
  month?: string;
  label?: string;
  revenue?: number | string | null;
  amount?: number | string | null;
  value?: number | string | null;
}

export interface DashboardStagePoint {
  stageId?: string;
  stage_id?: string;
  name?: string;
  stage?: string;
  color?: string | null;
  count?: number | string | null;
  leads?: number | string | null;
  value?: number | string | null;
}

export interface DashboardStatusPoint {
  status?: "won" | "open" | "lost" | string;
  name?: string;
  count?: number | string | null;
  value?: number | string | null;
}

export interface DashboardResponse {
  revenue_total?: number | string | DashboardMetric | null;
  revenueTotal?: number | string | DashboardMetric | null;
  deals_in_pipeline?:
    | { count?: number | string | null; value?: number | string | null; change?: number | string | null }
    | DashboardMetric
    | null;
  dealsInPipeline?:
    | { count?: number | string | null; value?: number | string | null; change?: number | string | null }
    | DashboardMetric
    | null;
  close_rate?: number | string | DashboardMetric | null;
  closeRate?: number | string | DashboardMetric | null;
  activities_today?:
    | {
        total?: number | string | null;
        tasks?: number | string | null;
        messages?: number | string | null;
        change?: number | string | null;
      }
    | DashboardMetric
    | null;
  activitiesToday?:
    | {
        total?: number | string | null;
        tasks?: number | string | null;
        messages?: number | string | null;
        change?: number | string | null;
      }
    | DashboardMetric
    | null;
  revenue_by_month?: DashboardMonthPoint[];
  revenueByMonth?: DashboardMonthPoint[];
  leads_by_stage?:
    | { pipelineId?: string | null; pipelineName?: string | null; stages?: DashboardStagePoint[] }
    | DashboardStagePoint[];
  leadsByStage?:
    | { pipelineId?: string | null; pipelineName?: string | null; stages?: DashboardStagePoint[] }
    | DashboardStagePoint[];
  lead_status?: DashboardStatusPoint[];
  leadStatus?: DashboardStatusPoint[];
  status_breakdown?: DashboardStatusPoint[];
  statusBreakdown?: DashboardStatusPoint[];
  won?: number | string | null;
  open?: number | string | null;
  lost?: number | string | null;
  new_leads_today_yesterday?: { today?: number | string | null; yesterday?: number | string | null };
  newLeadsTodayYesterday?: { today?: number | string | null; yesterday?: number | string | null };
}

export interface ReportsMonthPoint {
  month?: string;
  label?: string;
  revenue?: number | string | null;
  amount?: number | string | null;
  value?: number | string | null;
}

export interface ReportsStagePoint {
  stageId?: string;
  stage_id?: string;
  name: string;
  type?: string | null;
  count?: number | string | null;
  conversion?: number | string | null;
}

export interface ReportsSalesRankingPoint {
  userId?: string | null;
  user_id?: string | null;
  name: string;
  wonLeads?: number | string | null;
  won_leads?: number | string | null;
  revenue?: number | string | null;
}

export interface ReportsWinLoss {
  won?: number | string | null;
  lost?: number | string | null;
  winRate?: number | string | null;
  win_rate?: number | string | null;
  reasons?: Array<{ reason: string; count?: number | string | null }>;
}

export interface ReportsResponse {
  range?: { from?: string; to?: string };
  pipelineId?: string | null;
  pipeline_id?: string | null;
  revenue_by_month?: ReportsMonthPoint[];
  revenueByMonth?: ReportsMonthPoint[];
  conversion_by_stage?: ReportsStagePoint[];
  conversionByStage?: ReportsStagePoint[];
  sales_ranking?: ReportsSalesRankingPoint[];
  salesRanking?: ReportsSalesRankingPoint[];
  win_loss?: ReportsWinLoss;
  winLoss?: ReportsWinLoss;
  avg_cycle_time?: { days?: number | string | null; sample?: number | string | null };
  avgCycleTime?: { days?: number | string | null; sample?: number | string | null };
}

export interface WhatsappConnectionResponse {
  connected: boolean;
  phoneNumber?: string | null;
  qrPng?: string | null;
  awaitingQr?: boolean;
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

export async function getContacts(params: { search?: string; companyId?: string } = {}) {
  const searchParams = new URLSearchParams();
  if (params.search) {
    searchParams.set("search", params.search);
  }
  if (params.companyId) {
    searchParams.set("companyId", params.companyId);
  }
  const query = searchParams.toString();
  const response = await apiFetch<ContactSummary[] | { data?: ContactSummary[]; items?: ContactSummary[] }>(
    `/api/contacts${query ? `?${query}` : ""}`,
  );
  return unwrapList(response);
}

export async function getContact(id: string) {
  const response = await apiFetch<ContactSummary | { data?: ContactSummary }>(`/api/contacts/${id}`);
  if (response && "data" in response && response.data) return response.data;
  return response as ContactSummary;
}

export async function createLead(input: {
  name: string;
  pipelineId: string;
  stageId?: string;
  value?: number;
}) {
  const response = await apiFetch<Lead | { data?: Lead }>("/api/leads", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (response && "data" in response && response.data) return response.data;
  return response as Lead;
}

export async function getCompanies(params: { search?: string } = {}) {
  const searchParams = new URLSearchParams();
  if (params.search) {
    searchParams.set("search", params.search);
  }
  const query = searchParams.toString();
  const response = await apiFetch<CompanySummary[] | { data?: CompanySummary[]; items?: CompanySummary[] }>(
    `/api/companies${query ? `?${query}` : ""}`,
  );
  return unwrapList(response);
}

export async function getCompany(id: string) {
  return apiFetch<CompanySummary>(`/api/companies/${id}`);
}

export async function updateCompany(id: string, input: Partial<CompanySummary>) {
  return apiFetch<CompanySummary>(`/api/companies/${id}`, {
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

export async function getConversations(params: { status?: string; mode?: ConversationMode; search?: string } = {}) {
  const searchParams = new URLSearchParams();
  if (params.status) {
    searchParams.set("status", params.status);
  }
  if (params.mode) {
    searchParams.set("mode", params.mode);
  }
  if (params.search) {
    searchParams.set("search", params.search);
  }
  const query = searchParams.toString();
  const response = await apiFetch<Conversation[] | { data?: Conversation[]; items?: Conversation[] }>(
    `/api/conversations${query ? `?${query}` : ""}`,
  );
  return unwrapList(response);
}

export async function updateConversationMode(conversationId: string, mode: ConversationMode) {
  return apiFetch<Conversation>(`/api/conversations/${conversationId}/mode`, {
    method: "PATCH",
    body: JSON.stringify({ mode }),
  });
}

export async function deleteConversation(conversationId: string) {
  return apiFetch<{ id: string }>(`/api/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export async function getWhatsappConnection() {
  try {
    return await apiFetch<WhatsappConnectionResponse>("/api/whatsapp/connection");
  } catch (error) {
    if (error instanceof ApiError || error instanceof TypeError) {
      return { connected: false, phoneNumber: null, qrPng: null, awaitingQr: false };
    }
    throw error;
  }
}

export async function connectWhatsapp() {
  try {
    return await apiFetch<{ ok: boolean }>("/api/whatsapp/connect", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch (error) {
    if (error instanceof ApiError || error instanceof TypeError) {
      return { ok: false };
    }
    throw error;
  }
}

export async function disconnectWhatsapp() {
  try {
    return await apiFetch<{ ok: boolean }>("/api/whatsapp/disconnect", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch (error) {
    if (error instanceof ApiError || error instanceof TypeError) {
      return { ok: false };
    }
    throw error;
  }
}

export async function sendConversationMessage(conversationId: string, input: { body: string }) {
  return apiFetch<Message>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getTasks(
  params: {
    status?: TaskStatus | "all";
    type?: TaskType | "all";
    assignedTo?: string;
    leadId?: string;
    from?: string;
    to?: string;
  } = {},
) {
  const searchParams = new URLSearchParams();
  if (params.status && params.status !== "all") {
    searchParams.set("status", params.status);
  }
  if (params.type && params.type !== "all") {
    searchParams.set("type", params.type);
  }
  if (params.assignedTo) {
    searchParams.set("assignedTo", params.assignedTo);
  }
  if (params.leadId) {
    searchParams.set("leadId", params.leadId);
  }
  if (params.from) {
    searchParams.set("from", params.from);
  }
  if (params.to) {
    searchParams.set("to", params.to);
  }
  const query = searchParams.toString();
  const response = await apiFetch<Task[] | { data?: Task[]; items?: Task[] }>(
    `/api/tasks${query ? `?${query}` : ""}`,
  );
  return unwrapList(response);
}

export async function createTask(input: TaskInput) {
  return apiFetch<Task>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getBots() {
  const response = await apiFetch<BotSummary[] | { data?: BotSummary[]; items?: BotSummary[] }>(
    "/api/bots",
  );
  return unwrapList(response);
}

export async function getBot(id: string) {
  const response = await apiFetch<BotSummary | { data?: BotSummary }>(`/api/bots/${id}`);
  if ("data" in response && response.data) {
    return response.data;
  }
  return response as BotSummary;
}

export async function createBot(input: { name: string; status?: BotStatus }) {
  return apiFetch<BotSummary>("/api/bots", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function saveBotFlow(botId: string, graph: BotFlowGraph) {
  return apiFetch<BotFlow>(`/api/bots/${botId}/flow`, {
    method: "PUT",
    body: JSON.stringify(graph),
  });
}

export async function updateTask(id: string, input: Partial<TaskInput>) {
  return apiFetch<Task>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteTask(id: string) {
  return apiFetch<{ id: string }>(`/api/tasks/${id}`, {
    method: "DELETE",
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
