import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, MessageCircle, Search, Send, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteConversation,
  getConversationMessages,
  getConversations,
  sendConversationMessage,
  type ChannelType,
  type Conversation,
  type ConversationMode,
  type Message,
  type SenderType,
  updateConversationMode,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const MODE_LABELS: Record<ConversationMode, string> = {
  bot: "Bot",
  ai: "IA",
  human: "Humano",
};

function getMessageSenderType(message: Message): SenderType {
  return message.senderType ?? message.sender_type ?? "contact";
}

function getMessageSenderName(message: Message) {
  return message.senderName ?? message.sender_name ?? "";
}

function getMessageDate(message: Message) {
  const rawDate = message.createdAt ?? message.created_at;
  if (!rawDate) {
    return "";
  }
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function getConversationDate(conversation: Conversation) {
  const rawDate = conversation.lastMessageAt ?? conversation.last_message_at;
  if (!rawDate) {
    return "";
  }
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getChannel(conversation?: Conversation | null) {
  return conversation?.channel?.type ?? null;
}

function getConversationName(conversation: Conversation) {
  return conversation.contact?.name ?? conversation.lead?.name ?? "Conversación sin nombre";
}

function getConversationAvatar(conversation: Conversation) {
  return conversation.contact?.avatarUrl ?? conversation.contact?.avatar_url ?? undefined;
}

function getLastMessage(conversation: Conversation) {
  return conversation.messages?.[0]?.body ?? "Sin mensajes";
}

export function ChatInbox() {
  const [search, setSearch] = useState("");
  const [activeConversationId, setActiveConversationId] = useState("");

  const { data: conversations = [], isLoading, isError } = useQuery({
    queryKey: ["conversations", search],
    queryFn: () => getConversations({ search }),
    refetchInterval: 2_000,
  });

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0] ?? null;

  useEffect(() => {
    setActiveConversationId((currentId) => {
      if (currentId && conversations.some((conversation) => conversation.id === currentId)) {
        return currentId;
      }
      return conversations[0]?.id ?? "";
    });
  }, [conversations]);

  return (
    <div className="grid min-h-[calc(100vh-13rem)] overflow-hidden rounded-lg border border-border bg-card/85 shadow-2xl shadow-black/20 lg:grid-cols-[22rem_1fr]">
      <aside className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
        <div className="border-b border-border p-4">
          <h1 className="text-lg font-semibold">Chat</h1>
          <label className="mt-3 flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar conversación"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton key={index} className="h-20" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-3">
              <EmptyState title="No se pudieron cargar conversaciones" />
            </div>
          ) : conversations.length > 0 ? (
            conversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversation?.id}
                onSelect={() => setActiveConversationId(conversation.id)}
              />
            ))
          ) : (
            <div className="p-3">
              <EmptyState title="Sin conversaciones" description="Aún no hay chats para mostrar." />
            </div>
          )}
        </div>
      </aside>

      <ChatConversationPanel conversation={activeConversation} onDeleted={() => setActiveConversationId("")} />
    </div>
  );
}

function ConversationListItem({
  conversation,
  isActive,
  onSelect,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
}) {
  const channel = getChannel(conversation);

  return (
    <button
      className={cn(
        "grid w-full grid-cols-[auto_1fr] gap-3 border-b border-border p-3 text-left transition hover:bg-accent/35",
        isActive && "bg-accent/50",
      )}
      type="button"
      onClick={onSelect}
    >
      <Avatar name={getConversationName(conversation)} src={getConversationAvatar(conversation)} />
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold">{getConversationName(conversation)}</p>
          <span className="shrink-0 text-[11px] text-muted-foreground">{getConversationDate(conversation)}</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{getLastMessage(conversation)}</p>
        <div className="mt-2 flex items-center gap-2">
          {channel ? <Badge>{CHANNEL_LABELS[channel]}</Badge> : null}
          <span className="text-[11px] text-muted-foreground">{conversation._count?.messages ?? 0} mensajes</span>
        </div>
      </div>
    </button>
  );
}

export function ChatConversationPanel({
  conversation,
  conversations,
  onConversationChange,
  onDeleted,
}: {
  conversation: Conversation | null;
  conversations?: Conversation[];
  onConversationChange?: (conversationId: string) => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [messageDraft, setMessageDraft] = useState("");
  const conversationId = conversation?.id ?? "";
  const channel = getChannel(conversation);
  const mode = conversation?.mode ?? "human";
  const isHuman = mode === "human";

  const { data: messages = [], isLoading, isError } = useQuery({
    queryKey: ["conversation-messages", conversationId],
    queryFn: () => getConversationMessages(conversationId),
    enabled: Boolean(conversationId),
    refetchInterval: 2_000,
  });

  const modeMutation = useMutation({
    mutationFn: (nextMode: ConversationMode) => updateConversationMode(conversationId, nextMode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["lead"] });
    },
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendConversationMessage(conversationId, { body }),
    onSuccess: () => {
      setMessageDraft("");
      void queryClient.invalidateQueries({ queryKey: ["conversation-messages", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["lead"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteConversation(conversationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["lead"] });
      onDeleted?.();
    },
  });

  function handleSend() {
    const body = messageDraft.trim();
    if (!body || !conversation || !isHuman) {
      return;
    }
    sendMutation.mutate(body);
  }

  function handleDelete() {
    if (!conversation || !window.confirm("¿Borrar esta conversación y sus mensajes?")) {
      return;
    }
    deleteMutation.mutate();
  }

  if (!conversation) {
    return (
      <section className="flex min-h-0 items-center justify-center bg-background/40 p-6">
        <EmptyState title="Selecciona una conversación" description="El historial aparecerá aquí." />
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col bg-background/40">
      <div className="border-b border-border p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
              <MessageCircle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{getConversationName(conversation)}</h2>
              <p className="truncate text-xs text-muted-foreground">
                {channel ? CHANNEL_LABELS[channel] : "Sin canal"} · {conversation.status ?? "open"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {conversations && conversations.length > 1 ? (
              <select
                className="h-9 max-w-52 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={conversation.id}
                onChange={(event) => onConversationChange?.(event.target.value)}
                aria-label="Seleccionar conversación"
              >
                {conversations.map((item, index) => (
                  <option key={item.id} value={item.id}>
                    {item.channel?.name ?? `Conversación ${index + 1}`}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex rounded-md border border-border bg-background p-1">
              {(["bot", "ai", "human"] as ConversationMode[]).map((item) => (
                <button
                  key={item}
                  className={cn(
                    "rounded-sm px-3 py-1.5 text-xs font-medium",
                    mode === item ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                  type="button"
                  onClick={() => modeMutation.mutate(item)}
                  disabled={modeMutation.isPending}
                >
                  {MODE_LABELS[item]}
                </button>
              ))}
            </div>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteMutation.isPending}>
              <Trash2 className="h-4 w-4" />
              Borrar conversación
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-16" />)
        ) : isError ? (
          <EmptyState title="No se pudieron cargar los mensajes" description="Revisa la API e intenta de nuevo." />
        ) : messages.length > 0 ? (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        ) : (
          <EmptyState title="Sin mensajes" description="La conversación no tiene mensajes todavía." />
        )}
      </div>

      <div className="border-t border-border p-4">
        {!isHuman ? (
          <p className="mb-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            {mode === "bot" ? "El salesbot responde esta conversación." : "La IA responde esta conversación."}
          </p>
        ) : null}
        <div className="flex gap-2">
          <textarea
            className="min-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            value={messageDraft}
            onChange={(event) => setMessageDraft(event.target.value)}
            placeholder={isHuman ? "Escribe una respuesta" : "Cambia a Humano para responder"}
            disabled={!isHuman}
            rows={2}
          />
          <Button
            className="self-end"
            onClick={handleSend}
            disabled={!isHuman || !messageDraft.trim() || sendMutation.isPending}
          >
            <Send className="h-4 w-4" />
            Enviar
          </Button>
        </div>
      </div>
    </section>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const senderType = getMessageSenderType(message);
  const isContact = senderType === "contact";
  const senderName = getMessageSenderName(message);
  const Icon = senderType === "bot" ? Bot : UserRound;

  return (
    <div className={cn("flex", isContact ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[78%] rounded-lg border px-3 py-2 text-sm",
          isContact
            ? "border-border bg-secondary text-secondary-foreground"
            : senderType === "bot"
              ? "border-primary/30 bg-primary/15 text-foreground"
              : "border-emerald-500/25 bg-emerald-500/10 text-foreground",
        )}
      >
        {!isContact ? (
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            <span>{senderType === "bot" ? "Bot" : senderName || "Asesor"}</span>
          </div>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{message.body || "Mensaje sin texto"}</p>
        <p className="mt-1 text-right text-[11px] text-muted-foreground">{getMessageDate(message)}</p>
      </div>
    </div>
  );
}
