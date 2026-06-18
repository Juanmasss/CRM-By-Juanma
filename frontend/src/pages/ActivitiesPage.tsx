import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  SquarePen,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createTask,
  getContacts,
  getLeads,
  getTasks,
  type ContactSummary,
  type Lead,
  type Task,
  type TaskInput,
  type TaskStatus,
  type TaskType,
  updateTask,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const TASK_TYPES: Array<{ value: TaskType; label: string; color: string; icon: ReactNode }> = [
  { value: "task", label: "Tarea", color: "#8b5cf6", icon: <CheckSquare className="h-4 w-4" /> },
  { value: "call", label: "Llamada", color: "#06b6d4", icon: <Phone className="h-4 w-4" /> },
  { value: "email", label: "Email", color: "#f59e0b", icon: <Mail className="h-4 w-4" /> },
  { value: "meeting", label: "Reunión", color: "#22c55e", icon: <Users className="h-4 w-4" /> },
  { value: "whatsapp", label: "WhatsApp", color: "#25d366", icon: <MessageCircle className="h-4 w-4" /> },
];

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pendiente",
  overdue: "Vencida",
  completed: "Completada",
};

type ViewMode = "list" | "calendar";

interface TaskFilters {
  type: TaskType | "all";
  assignedTo: string;
  status: TaskStatus | "all";
  from: string;
  to: string;
}

function getTaskType(task: Task) {
  return task.type ?? "task";
}

function getTaskTypeMeta(type: TaskType) {
  return TASK_TYPES.find((item) => item.value === type) ?? TASK_TYPES[0];
}

function getDueAt(task: Task) {
  return task.dueAt ?? task.due_at ?? "";
}

function getCompletedAt(task: Task) {
  return task.completedAt ?? task.completed_at ?? "";
}

function getAssignedTo(task: Task) {
  return task.assignedTo ?? task.assigned_to ?? null;
}

function getLeadId(task: Task) {
  return task.leadId ?? task.lead_id ?? task.lead?.id ?? "";
}

function getTaskStatus(task: Task): TaskStatus {
  if (getCompletedAt(task)) {
    return "completed";
  }
  const dueAt = getDueAt(task);
  if (dueAt && new Date(dueAt).getTime() < Date.now()) {
    return "overdue";
  }
  return "pending";
}

function getLeadName(lead?: Pick<Lead, "name" | "title"> | null) {
  return lead?.name ?? lead?.title ?? "Sin lead";
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Sin fecha";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toDateInputValue(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateInputValue(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function dateOnly(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getMonthRange(date: Date) {
  const start = startOfMonth(date);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}

function buildCalendarDays(month: Date) {
  const start = startOfMonth(month);
  const firstDay = (start.getDay() + 6) % 7;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - firstDay);

  return Array.from({ length: 42 }).map((_, index) => {
    const day = new Date(cursor);
    day.setDate(cursor.getDate() + index);
    return day;
  });
}

function getTaskSearchText(task: Task) {
  return [task.title, task.description, task.lead?.name, getAssignedTo(task)?.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getContactForLead(lead: Lead, contacts: ContactSummary[]) {
  if (lead.contact?.id) {
    return lead.contact.id;
  }
  return contacts.find((contact) => contact.name && contact.name === lead.contact?.name)?.id ?? "";
}

export function ActivitiesPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [filters, setFilters] = useState<TaskFilters>({
    type: "all",
    assignedTo: "",
    status: "all",
    from: "",
    to: "",
  });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const taskQueryParams = useMemo(
    () => ({
      type: filters.type,
      status: filters.status,
      assignedTo: filters.assignedTo || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    [filters],
  );

  const {
    data: tasks = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["tasks", taskQueryParams],
    queryFn: () => getTasks(taskQueryParams),
    refetchInterval: 15_000,
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks", "assignees"],
    queryFn: () => getTasks(),
    staleTime: 60_000,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["leads", "activity-selector"],
    queryFn: () => getLeads({}),
    staleTime: 60_000,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts", "activity-selector"],
    queryFn: () => getContacts(),
    staleTime: 60_000,
  });

  const completeMutation = useMutation({
    mutationFn: ({ task, completed }: { task: Task; completed: boolean }) =>
      updateTask(task.id, { completed }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const visibleTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filters.status !== "all" && getTaskStatus(task) !== filters.status) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return getTaskSearchText(task).includes(normalizedSearch);
    });
  }, [filters.status, search, tasks]);

  const assignees = useMemo(() => {
    const byId = new Map<string, string>();
    allTasks.forEach((task) => {
      const assignee = getAssignedTo(task);
      if (assignee?.id) {
        byId.set(assignee.id, assignee.name);
      }
    });
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [allTasks]);

  function openCreateModal() {
    setEditingTask(null);
    setIsModalOpen(true);
  }

  function openEditModal(task: Task) {
    setEditingTask(task);
    setIsModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actividades"
        description="Tareas comerciales, llamadas, emails, reuniones y WhatsApp"
        actions={
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Crear tarea
          </Button>
        }
      />

      <Card className="space-y-4 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar actividad, lead o responsable"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Tipo"
              value={filters.type}
              onChange={(value) => setFilters((current) => ({ ...current, type: value as TaskType | "all" }))}
            >
              <option value="all">Todos los tipos</option>
              {TASK_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Responsable"
              value={filters.assignedTo}
              onChange={(value) => setFilters((current) => ({ ...current, assignedTo: value }))}
            >
              <option value="">Todos</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Estado"
              value={filters.status}
              onChange={(value) => setFilters((current) => ({ ...current, status: value as TaskStatus | "all" }))}
            >
              <option value="all">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="overdue">Vencida</option>
              <option value="completed">Completada</option>
            </FilterSelect>
            <DateFilter
              label="Desde"
              value={filters.from}
              onChange={(value) => setFilters((current) => ({ ...current, from: value }))}
            />
            <DateFilter
              label="Hasta"
              value={filters.to}
              onChange={(value) => setFilters((current) => ({ ...current, to: value }))}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex rounded-md border border-border bg-background p-1">
            <button
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm",
                viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
              type="button"
              onClick={() => setViewMode("list")}
            >
              Lista
            </button>
            <button
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm",
                viewMode === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
              type="button"
              onClick={() => setViewMode("calendar")}
            >
              Calendario
            </button>
          </div>
          <p className="text-sm text-muted-foreground">{visibleTasks.length} actividades</p>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState title="No se pudieron cargar las actividades" description="Revisa la API e intenta de nuevo." />
      ) : viewMode === "list" ? (
        <TaskList
          tasks={visibleTasks}
          onEdit={openEditModal}
          onToggleComplete={(task) =>
            completeMutation.mutate({ task, completed: getTaskStatus(task) !== "completed" })
          }
        />
      ) : (
        <CalendarView
          month={calendarMonth}
          tasks={visibleTasks}
          onMonthChange={setCalendarMonth}
          onEdit={openEditModal}
        />
      )}

      {isModalOpen ? (
        <TaskModal
          task={editingTask}
          leads={leads}
          contacts={contacts}
          onClose={() => setIsModalOpen(false)}
          onSaved={() => {
            setIsModalOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
          }}
        />
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="min-w-36">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-36">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TaskList({
  tasks,
  onEdit,
  onToggleComplete,
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
}) {
  if (tasks.length === 0) {
    return <EmptyState title="Sin actividades" description="Crea una tarea o ajusta los filtros." />;
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onEdit={onEdit} onToggleComplete={onToggleComplete} />
      ))}
    </div>
  );
}

function TaskRow({
  task,
  onEdit,
  onToggleComplete,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
}) {
  const type = getTaskTypeMeta(getTaskType(task));
  const status = getTaskStatus(task);
  const assignee = getAssignedTo(task);

  return (
    <Card className="grid gap-4 p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
      <button
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-md border transition",
          status === "completed"
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
            : "border-border bg-secondary text-muted-foreground hover:text-foreground",
        )}
        type="button"
        onClick={() => onToggleComplete(task)}
        aria-label="Marcar completada"
      >
        {status === "completed" ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      </button>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={type.value} />
          <StatusBadge status={status} />
          <p className="min-w-0 truncate text-sm font-semibold">{task.title}</p>
        </div>
        {task.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDateTime(getDueAt(task))}
          </span>
          <span className="flex items-center gap-1">
            <SquarePen className="h-3.5 w-3.5" />
            {getLeadName(task.lead)}
          </span>
          <span className="flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" />
            {assignee?.name ?? "Sin responsable"}
          </span>
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={() => onEdit(task)}>
        <SquarePen className="h-4 w-4" />
        Editar
      </Button>
    </Card>
  );
}

function TypeBadge({ type }: { type: TaskType }) {
  const meta = getTaskTypeMeta(type);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium"
      style={{ borderColor: `${meta.color}55`, backgroundColor: `${meta.color}18`, color: meta.color }}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge
      className={cn(
        status === "completed" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        status === "overdue" && "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function CalendarView({
  month,
  tasks,
  onMonthChange,
  onEdit,
}: {
  month: Date;
  tasks: Task[];
  onMonthChange: (date: Date) => void;
  onEdit: (task: Task) => void;
}) {
  const days = buildCalendarDays(month);
  const { start, end } = getMonthRange(month);
  const monthTasks = tasks.filter((task) => {
    const dueAt = getDueAt(task);
    if (!dueAt) {
      return false;
    }
    const date = new Date(dueAt);
    return date >= start && date <= new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
  });
  const tasksByDay = new Map<string, Task[]>();
  monthTasks.forEach((task) => {
    const key = dateOnly(getDueAt(task));
    tasksByDay.set(key, [...(tasksByDay.get(key) ?? []), task]);
  });

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => onMonthChange(addMonths(month, -1))} aria-label="Mes anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(month)}
        </h2>
        <Button variant="outline" size="icon" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Mes siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 border-b border-border text-center text-xs uppercase text-muted-foreground">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
          <div key={day} className="py-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = dateOnly(day.toISOString());
          const dayTasks = tasksByDay.get(key) ?? [];
          const isCurrentMonth = day.getMonth() === month.getMonth();
          return (
            <div
              key={key}
              className={cn(
                "min-h-32 border-b border-r border-border p-2",
                !isCurrentMonth && "bg-secondary/20 text-muted-foreground",
              )}
            >
              <div className="mb-2 text-xs font-medium">{day.getDate()}</div>
              <div className="space-y-1">
                {dayTasks.slice(0, 4).map((task) => {
                  const type = getTaskTypeMeta(getTaskType(task));
                  return (
                    <button
                      key={task.id}
                      className="block w-full truncate rounded-sm px-2 py-1 text-left text-xs"
                      style={{ backgroundColor: `${type.color}20`, color: type.color }}
                      type="button"
                      onClick={() => onEdit(task)}
                    >
                      {task.title}
                    </button>
                  );
                })}
                {dayTasks.length > 4 ? (
                  <p className="text-xs text-muted-foreground">+{dayTasks.length - 4} más</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TaskModal({
  task,
  leads,
  contacts,
  onClose,
  onSaved,
}: {
  task: Task | null;
  leads: Lead[];
  contacts: ContactSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("task");
  const [description, setDescription] = useState("");
  const [contactId, setContactId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [completed, setCompleted] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: TaskInput) => (task ? updateTask(task.id, input) : createTask(input)),
    onSuccess: onSaved,
  });

  useEffect(() => {
    setTitle(task?.title ?? "");
    setType(getTaskType(task ?? ({ id: "", title: "" } as Task)));
    setDescription(task?.description ?? "");
    setLeadId(getLeadId(task ?? ({ id: "", title: "" } as Task)));
    setAssignedToUserId(task?.assignedToUserId ?? task?.assigned_to_user_id ?? getAssignedTo(task ?? ({ id: "", title: "" } as Task))?.id ?? "");
    setDueAt(toDateInputValue(getDueAt(task ?? ({ id: "", title: "" } as Task))));
    setCompleted(Boolean(task && getTaskStatus(task) === "completed"));
  }, [task]);

  useEffect(() => {
    if (!leadId) {
      return;
    }
    const selectedLead = leads.find((lead) => lead.id === leadId);
    if (selectedLead) {
      setContactId(getContactForLead(selectedLead, contacts));
    }
  }, [contacts, leadId, leads]);

  const filteredLeads = useMemo(() => {
    if (!contactId) {
      return leads;
    }
    return leads.filter((lead) => getContactForLead(lead, contacts) === contactId);
  }, [contactId, contacts, leads]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const payload: TaskInput = {
      title: title.trim(),
      type,
      description: description.trim() || null,
      leadId: leadId || null,
      assignedToUserId: assignedToUserId || null,
      dueAt: fromDateInputValue(dueAt),
      completed,
    };
    if (!payload.title) {
      return;
    }
    mutation.mutate(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-2xl shadow-black/60"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{task ? "Editar tarea" : "Crear tarea"}</h2>
            <p className="text-sm text-muted-foreground">Elige un contacto para filtrar leads disponibles.</p>
          </div>
          <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <Field label="Título" className="sm:col-span-2">
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </Field>
          <Field label="Tipo">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={type}
              onChange={(event) => setType(event.target.value as TaskType)}
            >
              {TASK_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha">
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </Field>
          <Field label="Contacto">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={contactId}
              onChange={(event) => {
                setContactId(event.target.value);
                setLeadId("");
              }}
            >
              <option value="">Todos los contactos</option>
              {contacts.map((contact) => (
                <option key={contact.id ?? contact.name} value={contact.id ?? ""}>
                  {contact.name ?? "Sin nombre"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lead">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={leadId}
              onChange={(event) => setLeadId(event.target.value)}
            >
              <option value="">Sin lead</option>
              {filteredLeads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {getLeadName(lead)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsable">
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={assignedToUserId}
              onChange={(event) => setAssignedToUserId(event.target.value)}
              placeholder="ID del responsable"
            />
          </Field>
          <Field label="Estado">
            <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
              <input
                type="checkbox"
                checked={completed}
                onChange={(event) => setCompleted(event.target.checked)}
              />
              Completada
            </label>
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            <textarea
              className="min-h-24 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending || !title.trim()}>
            {mutation.isPending ? "Guardando" : "Guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
