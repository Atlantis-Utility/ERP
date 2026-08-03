"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { getAvatarColor, getInitials } from "@/lib/utils";
import {
  Plus, CalendarDays, LayoutGrid, Clock,
  ExternalLink, CheckCircle2, Video, FolderKanban, Flag,
  LifeBuoy,
} from "lucide-react";
import AddTaskDrawer, {
  type KanbanCard,
  type KanbanColumn,
} from "@/components/tasks/AddTaskDrawer";
import AddMeetingDrawer from "@/components/tasks/AddMeetingDrawer";
import { subscribeTasks, addTask, updateTask, removeTask } from "@/lib/db/tasks";
import { subscribeProjects, updateProject } from "@/lib/db/projects";
import type { Project } from "@/lib/mock-projects";
import { useUnifiedTickets } from "@/lib/tickets/useUnifiedTickets";
import { addNotification, isTicketUnread } from "@/lib/notifications";
import { useAuth } from "@/lib/auth-context";
import TaskDetailDrawer from "@/components/tasks/TaskDetailDrawer";
import { PHASE_DEFS } from "@/components/projects/ProjectPhases";

/* ─── constants ─────────────────────────────────────────────────────── */

// "done" is intentionally excluded: completed items live in the Completed tab, not the board.
const COLUMNS: { id: KanbanColumn; label: string; dot: string }[] = [
  { id: "backlog",     label: "Backlog",     dot: "#999"    },
  { id: "in-progress", label: "In Progress", dot: "#0070f3" },
  { id: "review",      label: "In Review",   dot: "#f59e0b" },
];

const PLATFORM_CONFIG: Record<string, { label: string; color: string; bg: string; letter: string }> = {
  zoom:        { label: "Zoom",            color: "#2D8CFF", bg: "#eff6ff", letter: "Z"  },
  meet:        { label: "Google Meet",     color: "#34A853", bg: "#f0fdf4", letter: "G"  },
  teams:       { label: "Teams",           color: "#5c5fc9", bg: "#f0f0f9", letter: "T"  },
  webex:       { label: "Webex",           color: "#00BEF3", bg: "#ecfeff", letter: "W"  },
  "in-person": { label: "In Person",       color: "#b45309", bg: "#fffbeb", letter: "📍" },
};

const PRIORITY_DOT: Record<string, string> = {
  high:   "bg-[#ef4444]",
  medium: "bg-[#f59e0b]",
  low:    "bg-[#22c55e]",
};

const TYPE_BADGE: Record<string, string> = {
  task:    "bg-[#f5f5f5] text-[#666]",
  meeting: "bg-[#eff6ff] text-[#2563eb]",
  project: "bg-[#f0fdf4] text-[#16a34a]",
  ticket:  "bg-[#fef3c7] text-[#b45309]",
};

/* ─── helpers ────────────────────────────────────────────────────────── */

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// Mirrors the phase bucketing in ProjectPhases.tsx, reads the same localStorage
// entry so the "Follow Up" tab reflects the phases shown on the project page.
function getCurrentPhaseId(project: Project): string | null {
  let phases: Record<string, { status: string }> | null = null;
  try {
    const stored = localStorage.getItem(`project_phases_${project.id}`);
    if (stored) phases = JSON.parse(stored);
  } catch {}

  if (phases) {
    const active = PHASE_DEFS.find((d) => (phases![d.id]?.status ?? "not-started") !== "completed");
    return active ? active.id : null;
  }

  const total = PHASE_DEFS.length;
  const active = PHASE_DEFS.find((d, i) => project.progress < ((i + 1) / total) * 100);
  return active ? active.id : null;
}

/* ─── sub-components ─────────────────────────────────────────────────── */

function PlatformBadge({ platform }: { platform: string }) {
  const cfg = PLATFORM_CONFIG[platform];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <span
        className="w-3.5 h-3.5 rounded-full text-white flex items-center justify-center text-[7px] font-bold shrink-0"
        style={{ backgroundColor: cfg.color }}
      >
        {cfg.letter === "📍" ? "📍" : cfg.letter}
      </span>
      {cfg.label}
    </span>
  );
}

function Card({
  card,
  onDragStart,
  onDragEnd,
  isDragging,
  isReadOnly = false,
  onClick,
}: {
  card: KanbanCard;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isReadOnly?: boolean;
  onClick?: () => void;
}) {
  const TODAY = todayString();
  const isOverdue = !card.dueDateTbd && card.dueDate && card.dueDate < TODAY && card.column !== "done";
  const ticketId = card.id.startsWith("ticket-") ? card.id.slice("ticket-".length) : null;
  const isNewTicket = ticketId !== null && isTicketUnread(ticketId);

  return (
    <div
      draggable={!isReadOnly}
      onDragStart={isReadOnly ? undefined : onDragStart}
      onDragEnd={isReadOnly ? undefined : onDragEnd}
      onClick={onClick}
      className={`group bg-white rounded-xl border p-3.5 transition-all select-none ${
        onClick ? "cursor-pointer" : isReadOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      } ${
        isDragging
          ? "opacity-40 scale-[0.97] shadow-lg"
          : isOverdue
          ? "border-[#fecaca] hover:border-[#f87171] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
          : isReadOnly
          ? "border-[#d1fae5] bg-[#f0fdf4] hover:border-[#6ee7b7] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
          : "border-[#eaeaea] hover:border-[#c9c9c9] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
      }`}
    >
      {/* Type badge + priority dot */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${TYPE_BADGE[card.type] ?? TYPE_BADGE.task}`}>
            {card.type}
          </span>
          {isNewTicket && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#dcfce7] text-[#16a34a]">
              New
            </span>
          )}
        </div>
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[card.priority]}`}
          title={`${card.priority} priority`}
        />
      </div>

      {/* Title */}
      <p className="text-[13px] font-semibold text-[#0a0a0a] leading-snug mb-1.5 group-hover:text-[#0070f3] transition-colors">
        {card.title}
      </p>

      {/* Description */}
      {card.description && (
        <p className="text-[11px] text-[#999] leading-relaxed line-clamp-2 mb-2.5">
          {card.description}
        </p>
      )}

      {/* Project progress bar */}
      {card.type === "project" && card.progress !== undefined && (
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[#999]">{card.progress}% complete</span>
          </div>
          <div className="h-1 bg-[#f1f1f1] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${card.column === "done" ? "bg-[#22c55e]" : "bg-[#0070f3]"}`}
              style={{ width: `${card.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Meeting row */}
      {card.type === "meeting" && card.platform && (
        <div className="flex items-center justify-between mb-2.5 flex-wrap gap-1">
          <div className="flex items-center gap-1.5">
            <PlatformBadge platform={card.platform} />
            {card.meetingTime && (
              <span className="text-[10px] text-[#666]">
                {formatTime(card.meetingTime)} · {card.duration}min
              </span>
            )}
          </div>
          {card.meetingUrl && (
            <a
              href={card.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] font-medium text-[#0070f3] hover:underline flex items-center gap-0.5 shrink-0"
            >
              Join <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      )}

      {/* Tags */}
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {card.tags.map((tag) => (
            <span key={tag} className="text-[9px] font-medium px-1.5 py-0.5 bg-[#f5f5f5] text-[#666] rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2.5 border-t border-[#f5f5f5]">
        <span className={`text-[10px] flex items-center gap-1 ${isOverdue ? "text-[#dc2626] font-medium" : "text-[#999]"}`}>
          <Clock className="w-3 h-3 shrink-0" />
          {card.type === "meeting" && card.meetingDate
            ? formatShortDate(card.meetingDate)
            : card.dueDateTbd
            ? "TBD"
            : formatShortDate(card.dueDate)}
          {isOverdue && " · Overdue"}
        </span>

        <div className="flex items-center gap-1.5">
          {card.type === "project" && card.projectId && (
            <Link
              href={`/projects/${card.projectId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-[#999] hover:text-[#0070f3] transition-colors flex items-center gap-0.5"
              title="View project"
            >
              <FolderKanban className="w-3 h-3" />
            </Link>
          )}
          {card.type === "ticket" && card.ticketId && (
            <Link
              href={`/tickets/${card.ticketId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-[#999] hover:text-[#0070f3] transition-colors flex items-center gap-0.5"
              title="View ticket"
            >
              <LifeBuoy className="w-3 h-3" />
            </Link>
          )}
          <div className="flex -space-x-1">
            {card.assignees.slice(0, 3).map((name) => {
              const c = getAvatarColor(name);
              return (
                <div
                  key={name}
                  title={name}
                  className={`w-5 h-5 rounded-full ${c.bg} ${c.text} border-2 border-white flex items-center justify-center`}
                >
                  <span className="text-[8px] font-semibold">{getInitials(name)}</span>
                </div>
              );
            })}
            {card.assignees.length > 3 && (
              <div className="w-5 h-5 rounded-full bg-[#f1f1f1] border-2 border-white flex items-center justify-center">
                <span className="text-[8px] text-[#666] font-semibold">+{card.assignees.length - 3}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── main page ──────────────────────────────────────────────────────── */

type View   = "board" | "completed" | "followup";
type Filter = "all" | "task" | "meeting" | "project" | "high" | "mine";

const VIEW_CONFIG: Record<View, { label: string; icon: typeof LayoutGrid }> = {
  board:     { label: "Board",     icon: LayoutGrid   },
  completed: { label: "Completed", icon: CheckCircle2 },
  followup:  { label: "Follow Up", icon: Flag         },
};

export default function TasksPage() {
  const TODAY = todayString();
  const { authUser } = useAuth();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [cards, setCards]             = useState<KanbanCard[]>([]);
  const [projects, setProjects]       = useState<Project[]>([]);
  const { tickets } = useUnifiedTickets();
  const notifiedDeadlines             = useRef<Set<string>>(new Set());
  const [view, setView]               = useState<View>("board");
  const [filter, setFilter]           = useState<Filter>("all");
  const [search, setSearch]           = useState("");
  const [taskDrawerOpen, setTaskDrawerOpen]       = useState(false);
  const [meetingDrawerOpen, setMeetingDrawerOpen] = useState(false);
  const [defaultCol, setDefaultCol]   = useState<KanbanColumn | undefined>();
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<KanbanColumn | null>(null);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [detailOpen, setDetailOpen]     = useState(false);

  const todayStr = TODAY;

  const [, forceNotifTick] = useState(0);

  // Re-render ticket-derived cards' "New" tag live as tickets get opened/marked read
  useEffect(() => {
    function onNotif() { forceNotifTick((n) => n + 1); }
    window.addEventListener("app-notification", onNotif);
    return () => window.removeEventListener("app-notification", onNotif);
  }, []);

  useEffect(() => {
    try {
      const c = localStorage.getItem("sc:tasks");
      if (c) setCards(JSON.parse(c));
    } catch {}
    const unsub = subscribeTasks((cards) => {
      setCards(cards);
      try { localStorage.setItem("sc:tasks", JSON.stringify(cards)); } catch {}
    });
    return unsub;
  }, []);

  // Deep link from the navbar's global search (?task=<id>): open that card's
  // detail drawer once it's actually present in the loaded set, then clean the URL.
  useEffect(() => {
    const taskId = searchParams.get("task");
    if (!taskId) return;
    const card = cards.find((c) => c.id === taskId);
    if (card) {
      setSelectedCard(card);
      setDetailOpen(true);
      router.replace("/tasks");
    }
  }, [cards, searchParams, router]);

  useEffect(() => {
    // projects already cached by projects/page.tsx under "sc:projects"
    try {
      const c = localStorage.getItem("sc:projects");
      if (c) setProjects(JSON.parse(c));
    } catch {}
    const unsub = subscribeProjects((ps) => {
      setProjects(ps);
      try { localStorage.setItem("sc:projects", JSON.stringify(ps)); } catch {}
    });
    return unsub;
  }, []);

  // Deadline notifications: fires once per project per deadline, deduped via localStorage
  useEffect(() => {
    if (!projects.length) return;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    projects.forEach((project) => {
      if (project.status === "completed") return;
      const deadlineDate = project.deadline.split("T")[0];
      const storageKey   = `deadline_notified_${project.id}_${deadlineDate}`;
      if (notifiedDeadlines.current.has(storageKey)) return;
      if (localStorage.getItem(storageKey)) {
        notifiedDeadlines.current.add(storageKey);
        return;
      }
      const deadline = new Date(deadlineDate + "T00:00:00");
      const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
      if (daysLeft <= 7 && daysLeft >= 0) {
        notifiedDeadlines.current.add(storageKey);
        localStorage.setItem(storageKey, "1");
        const when = daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
        addNotification({
          prefId: "n-2",
          icon: "project",
          title: `Deadline ${when}: ${project.name}`,
          body: `"${project.name}" is due ${when}. Progress: ${project.progress}%.`,
          href: `/projects/${project.id}`,
        });
      }
    });
  }, [projects]);

  /* ─── derived ──────────────────────────────────────────────────── */

  // Project-derived cards (live from Firestore via subscribeProjects)
  const projectCards: KanbanCard[] = projects.map((p) => {
    const colMap: Record<Project["status"], KanbanColumn> = {
      active:    "in-progress",
      overdue:   "review",
      "on-hold": "backlog",
      completed: "done",
      cancelled: "done",
    };
    return {
      id:          `proj-${p.id}`,
      type:        "project" as const,
      title:       p.name,
      description: p.description || "",
      column:      colMap[p.status],
      priority:    p.priority,
      assignees:   p.team,
      dueDate:     p.deadline.split("T")[0],
      tags:        ([p.isp, p.clientName].filter(Boolean)) as string[],
      projectId:   p.id,
      progress:    p.progress,
    };
  });

  // Ticket-derived cards (live from useUnifiedTickets — email + manual tickets;
  // the hook itself already omits email tickets when Microsoft mail isn't connected).
  // Skip tickets TicketWatcher has already synced into a persisted task card
  // (same `ticket-<id>` id scheme) — otherwise both would render with the same key.
  const persistedCardIds = new Set(cards.map((c) => c.id));
  const ticketCards: KanbanCard[] = tickets
    .filter((t) => !persistedCardIds.has(`ticket-${t.id}`))
    .map(ticketToCard);

  function ticketToCard(t: (typeof tickets)[number]): KanbanCard {
    const colMap: Record<typeof t.status, KanbanColumn> = {
      open:          "backlog",
      "in-progress": "in-progress",
      resolved:      "done",
      closed:        "done",
    };
    return {
      id:          `ticket-${t.id}`,
      type:        "ticket" as const,
      title:       t.subject,
      description: t.description ?? t.snippet ?? "",
      column:      colMap[t.status],
      // KanbanPriority has no "urgent" tier — collapse it into "high" and
      // surface the distinction via a tag instead of losing the signal.
      priority:    t.priority === "urgent" ? "high" : t.priority,
      assignees:   t.assigneeName ? [t.assigneeName] : [],
      dueDate:     t.receivedAt.split("T")[0],
      tags:        [t.source, ...(t.priority === "urgent" ? ["Urgent"] : [])],
      // Only email tickets have a working detail route (`/tickets/[id]` resolves
      // Graph thread ids) — manual tickets show inline info with no dead link.
      ticketId:    t.source === "email" ? t.id : undefined,
    };
  }

  // All cards: user-created kanban cards + live project cards + live ticket cards
  const allCards = [...cards, ...projectCards, ...ticketCards];

  const todayMeetings = cards.filter((c) => c.type === "meeting" && c.meetingDate === todayStr);

  // Board stats
  const statsOverdue       = allCards.filter((c) => !c.dueDateTbd && c.dueDate && c.dueDate < TODAY && c.column !== "done").length;
  const statsDueToday      = allCards.filter((c) => (c.type === "meeting" ? c.meetingDate : c.dueDate) === TODAY).length;
  const statsInProgress    = allCards.filter((c) => c.column === "in-progress").length;
  const statsMeetingsToday = todayMeetings.length;

  const myName = authUser?.displayName ?? "";

  function matchesSearch(c: KanbanCard) {
    const q = search.toLowerCase();
    return (
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q)) ||
      c.assignees.some((a) => a.toLowerCase().includes(q))
    );
  }

  const filtered = allCards.filter((c) => {
    const matchesType =
      filter === "all"     ? true :
      filter === "task"    ? c.type === "task" :
      filter === "meeting" ? c.type === "meeting" :
      filter === "project" ? c.type === "project" :
      filter === "high"    ? c.priority === "high" :
      filter === "mine"    ? (myName !== "" && c.assignees.includes(myName)) :
      true;
    return matchesType && matchesSearch(c);
  });

  // Completed tab: any task, meeting, or project that reached "done"
  const completedCards = allCards.filter((c) => c.column === "done" && matchesSearch(c));

  // Follow Up tab: projects currently sitting in the project detail page's "Follow Up" phase
  const followUpProjectIds = new Set(
    projects
      .filter((p) => p.status !== "completed" && getCurrentPhaseId(p) === "followup")
      .map((p) => p.id)
  );
  const followUpCards = projectCards.filter(
    (c) => c.projectId && followUpProjectIds.has(c.projectId) && matchesSearch(c)
  );

  const filterTabs: { key: Filter; label: string }[] = [
    { key: "all",     label: "All" },
    { key: "task",    label: "Tasks" },
    { key: "meeting", label: "Meetings" },
    { key: "project", label: "Projects" },
    { key: "high",    label: "High Priority" },
    { key: "mine",    label: "My Tasks" },
  ];

  /* ─── drag & drop ──────────────────────────────────────────────── */
  function handleDragStart(e: React.DragEvent<HTMLDivElement>, id: string) {
    e.dataTransfer.setData("cardId", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }
  function handleDragOver(e: React.DragEvent<HTMLDivElement>, col: KanbanColumn) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(col);
  }
  const COL_TO_STATUS: Record<KanbanColumn, Project["status"]> = {
    "backlog":     "on-hold",
    "in-progress": "active",
    "review":      "overdue",
    "done":        "completed",
  };

  function handleDrop(e: React.DragEvent<HTMLDivElement>, col: KanbanColumn) {
    e.preventDefault();
    const id = e.dataTransfer.getData("cardId");
    if (id) {
      if (id.startsWith("proj-")) {
        const projectId = id.slice(5);
        updateProject(projectId, { status: COL_TO_STATUS[col] }).catch(console.error);
      } else {
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, column: col } : c)));
        updateTask(id, { column: col }).catch(console.error);
      }
    }
    setDraggingId(null);
    setDragOverCol(null);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
  }

  // Ticket cards are read-only references, not editable tasks — route them to
  // the ticket's own detail page instead of opening the generic edit drawer.
  function handleCardClick(card: KanbanCard) {
    if (card.type === "ticket") {
      if (card.ticketId) router.push(`/tickets/${card.ticketId}`);
      return;
    }
    setSelectedCard(card);
    setDetailOpen(true);
  }

  /* ─── render ─────────────────────────────────────────────────────── */
  return (
    <div>
      <Header
        title="Task Board"
        subtitle="Tasks, meetings, and projects across your team"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setDefaultCol(undefined); setMeetingDrawerOpen(true); }}
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-xs font-medium text-[#444] px-3 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
            >
              <Video className="w-3.5 h-3.5" />
              Schedule
            </button>
            <button
              onClick={() => { setDefaultCol(undefined); setTaskDrawerOpen(true); }}
              className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-[#333] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Task
            </button>
          </div>
        }
      />

      {/* ── Today's meetings banner ─────────────────────────────────── */}
      {todayMeetings.length > 0 && (
        <div className="bg-white border border-[#fde68a] rounded-xl px-4 py-3 mb-5 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 shrink-0">
            <CalendarDays className="w-3.5 h-3.5 text-[#b45309]" />
            <span className="text-xs font-semibold text-[#b45309]">Today</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {todayMeetings.map((m) => {
              const cfg = m.platform ? PLATFORM_CONFIG[m.platform] : null;
              return (
                <div key={m.id} className="flex items-center gap-2 bg-[#fffbeb] border border-[#fde68a] rounded-lg px-3 py-1.5">
                  {cfg && (
                    <span
                      className="w-3.5 h-3.5 rounded-full text-white text-[8px] font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: cfg.color }}
                    >
                      {cfg.letter === "📍" ? "📍" : cfg.letter}
                    </span>
                  )}
                  <span className="text-xs font-medium text-[#0a0a0a]">{m.title}</span>
                  {m.meetingTime && (
                    <span className="text-[10px] text-[#666]">{formatTime(m.meetingTime)}</span>
                  )}
                  {m.meetingUrl && (
                    <a
                      href={m.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-semibold text-[#0070f3] hover:underline flex items-center gap-0.5"
                    >
                      Join <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stats row ───────────────────────────────────────────────── */}
      <div className="flex items-center divide-x divide-[#f0f0f0] bg-white border border-[#eaeaea] rounded-xl mb-5 overflow-hidden">
        {[
          { value: statsOverdue,       label: "Overdue",        valueColor: statsOverdue > 0 ? "text-[#ef4444]" : "text-[#0a0a0a]" },
          { value: statsDueToday,      label: "Due Today",      valueColor: statsDueToday > 0 ? "text-[#f59e0b]" : "text-[#0a0a0a]" },
          { value: statsInProgress,    label: "In Progress",    valueColor: "text-[#0070f3]" },
          { value: statsMeetingsToday, label: "Meetings Today", valueColor: statsMeetingsToday > 0 ? "text-[#5c5fc9]" : "text-[#0a0a0a]" },
        ].map(({ value, label, valueColor }) => (
          <div key={label} className="flex-1 px-5 py-3 text-center">
            <p className={`text-xl font-bold tabular-nums leading-none ${valueColor}`}>{value}</p>
            <p className="text-[10px] text-[#999] mt-1.5 font-medium uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-[#f5f5f5] rounded-lg p-0.5">
            {(["board", "completed", "followup"] as View[]).map((v) => {
              const Icon = VIEW_CONFIG[v].icon;
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    view === v ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#888] hover:text-[#333]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {VIEW_CONFIG[v].label}
                </button>
              );
            })}
          </div>

          {/* Filter tabs */}
          {view === "board" && (
            <div className="flex items-center gap-0.5 bg-[#f5f5f5] rounded-lg p-0.5">
              {filterTabs.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    filter === f.key ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#888] hover:text-[#333]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs border border-[#eaeaea] rounded-lg px-3 py-1.5 w-full sm:w-52 outline-none focus:border-[#999] bg-white transition-colors placeholder:text-[#bbb]"
        />
      </div>

      {/* ── Board view ───────────────────────────────────────────────── */}
      {view === "board" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const colCards = filtered.filter((c) => c.column === col.id);
            const isOver   = dragOverCol === col.id;
            return (
              <div
                key={col.id}
                className="flex flex-col min-w-0"
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-1 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: col.dot }}
                    />
                    <span className="text-xs font-semibold text-[#0a0a0a]">{col.label}</span>
                    <span className="text-[10px] font-medium text-[#999] bg-[#f5f5f5] px-1.5 py-0.5 rounded-full tabular-nums">
                      {colCards.length}
                    </span>
                    {col.id !== "done" && (() => {
                      const oc = colCards.filter((c) => !c.dueDateTbd && c.dueDate && c.dueDate < TODAY).length;
                      return oc > 0 ? (
                        <span className="text-[9px] font-bold text-[#ef4444] bg-[#fef2f2] px-1.5 py-0.5 rounded-full tabular-nums">
                          {oc} overdue
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <button
                    onClick={() => { setDefaultCol(col.id); setTaskDrawerOpen(true); }}
                    className="p-1 rounded-md hover:bg-[#f5f5f5] transition-colors"
                    title="Add task"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#999]" />
                  </button>
                </div>

                {/* Drop zone */}
                <div
                  className={`flex-1 min-h-32 rounded-xl space-y-2.5 transition-colors ${
                    isOver ? "bg-[#f0f7ff] ring-2 ring-[#0070f3] ring-inset rounded-xl" : ""
                  }`}
                >
                  {colCards.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      onDragStart={(e) => handleDragStart(e, card.id)}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingId === card.id}
                      isReadOnly={card.type === "ticket"}
                      onClick={() => handleCardClick(card)}
                    />
                  ))}

                  {colCards.length === 0 && !isOver && (
                    <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-[#e8e8e8]">
                      <p className="text-[11px] text-[#ccc]">No items</p>
                    </div>
                  )}

                  {/* Add in column footer */}
                  <button
                    onClick={() => { setDefaultCol(col.id); setTaskDrawerOpen(true); }}
                    className="w-full flex items-center gap-1.5 text-[11px] text-[#bbb] hover:text-[#666] py-2 px-2 rounded-lg hover:bg-[#fafafa] transition-colors mt-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Completed view ──────────────────────────────────────────────── */}
      {view === "completed" && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
            <h2 className="text-sm font-semibold text-[#0a0a0a]">Completed</h2>
            <span className="text-[10px] font-medium text-[#999] bg-[#f5f5f5] px-1.5 py-0.5 rounded-full tabular-nums">
              {completedCards.length}
            </span>
          </div>
          {completedCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-[#e8e8e8]">
              <CheckCircle2 className="w-7 h-7 text-[#e8e8e8] mb-2" />
              <p className="text-xs text-[#bbb]">Nothing completed yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {completedCards.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  isDragging={false}
                  isReadOnly
                  onClick={() => handleCardClick(card)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Follow Up view ──────────────────────────────────────────────── */}
      {view === "followup" && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Flag className="w-4 h-4 text-[#f59e0b]" />
            <h2 className="text-sm font-semibold text-[#0a0a0a]">Follow Up</h2>
            <span className="text-[10px] font-medium text-[#999] bg-[#f5f5f5] px-1.5 py-0.5 rounded-full tabular-nums">
              {followUpCards.length}
            </span>
          </div>
          <p className="text-xs text-[#999] mb-4">
            Projects currently in the Follow Up phase: post-launch actions, client feedback, and handoff docs.
          </p>
          {followUpCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-[#e8e8e8]">
              <Flag className="w-7 h-7 text-[#e8e8e8] mb-2" />
              <p className="text-xs text-[#bbb]">No projects in follow up</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {followUpCards.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  isDragging={false}
                  isReadOnly
                  onClick={() => handleCardClick(card)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Drawers */}
      <AddTaskDrawer
        open={taskDrawerOpen}
        onClose={() => { setTaskDrawerOpen(false); setDefaultCol(undefined); }}
        onAdd={(card) => { addTask(card).catch(console.error); }}
        defaultColumn={defaultCol}
      />
      <AddMeetingDrawer
        open={meetingDrawerOpen}
        onClose={() => setMeetingDrawerOpen(false)}
        onAdd={(card) => { addTask(card).catch(console.error); }}
      />
      <TaskDetailDrawer
        card={selectedCard}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedCard(null); }}
        onUpdate={async (id, patch) => { await updateTask(id, patch); }}
        onDelete={async (id) => { await removeTask(id); }}
      />
    </div>
  );
}
