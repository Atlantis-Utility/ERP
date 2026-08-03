"use client";

import { useState, useEffect } from "react";
import Drawer from "@/components/ui/Drawer";
import FormField, { inputClass } from "@/components/ui/FormField";
import DateTimePicker from "@/components/ui/DateTimePicker";
import Select from "@/components/ui/Select";
import { useEmployees } from "@/lib/db/employees";
import { getAvatarColor, getInitials, getErrorMessage } from "@/lib/utils";
import Link from "next/link";
import {
  Clock, Trash2, Pencil, ExternalLink, Video,
  FolderKanban, Tag, AlertCircle, CheckCircle2, Check, Building2,
} from "lucide-react";
import type { KanbanCard, KanbanColumn, KanbanPriority } from "./AddTaskDrawer";

const PLATFORM_CONFIG: Record<string, { label: string; color: string; letter: string }> = {
  zoom:        { label: "Zoom",        color: "#2D8CFF", letter: "Z"  },
  meet:        { label: "Google Meet", color: "#34A853", letter: "G"  },
  teams:       { label: "Teams",       color: "#5c5fc9", letter: "T"  },
  webex:       { label: "Webex",       color: "#00BEF3", letter: "W"  },
  "in-person": { label: "In Person",   color: "#b45309", letter: "📍" },
};

const PRIORITY_STYLES = {
  high:   { dot: "bg-[#ef4444]", text: "text-[#ef4444]", label: "High" },
  medium: { dot: "bg-[#f59e0b]", text: "text-[#f59e0b]", label: "Medium" },
  low:    { dot: "bg-[#22c55e]", text: "text-[#22c55e]", label: "Low" },
};

const COLUMN_LABELS: Record<KanbanColumn, string> = {
  backlog:       "Backlog",
  "in-progress": "In Progress",
  review:        "In Review",
  done:          "Done",
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function fmtTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

interface Props {
  card: KanbanCard | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<KanbanCard>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const emptyForm = {
  title: "",
  description: "",
  column: "backlog" as KanbanColumn,
  priority: "medium" as KanbanPriority,
  dueDate: "",
  dueDateTbd: false,
  tagsStr: "",
  assignees: [] as string[],
  meetingDate: "",
  meetingTime: "",
  meetingUrl: "",
  duration: 30,
  company: "",
};

export default function TaskDetailDrawer({ card, open, onClose, onUpdate, onDelete }: Props) {
  const employees = useEmployees();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setConfirmDelete(false);
      setSaveError("");
    }
  }, [open]);

  useEffect(() => {
    if (card && editing) {
      setForm({
        title:       card.title,
        description: card.description,
        column:      card.column,
        priority:    card.priority,
        dueDate:     card.dueDate,
        dueDateTbd:  card.dueDateTbd ?? false,
        tagsStr:     card.tags.join(", "),
        assignees:   [...card.assignees],
        meetingDate: card.meetingDate ?? "",
        meetingTime: card.meetingTime ?? "",
        meetingUrl:  card.meetingUrl  ?? "",
        duration:    card.duration    ?? 30,
        company:     card.company     ?? "",
      });
    }
  }, [editing, card]);

  function setF<K extends keyof typeof emptyForm>(key: K, val: typeof emptyForm[K]) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  function toggleAssignee(name: string) {
    setForm((p) => ({
      ...p,
      assignees: p.assignees.includes(name)
        ? p.assignees.filter((n) => n !== name)
        : [...p.assignees, name],
    }));
  }

  async function handleSave() {
    if (!card || !form.title.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const patch: Partial<KanbanCard> = {
        title:       form.title.trim(),
        description: form.description.trim(),
        column:      form.column,
        priority:    form.priority,
        dueDate:     form.dueDateTbd ? "" : form.dueDate,
        dueDateTbd:  form.dueDateTbd || undefined,
        tags:        form.tagsStr.split(",").map((t) => t.trim()).filter(Boolean),
        assignees:   form.assignees,
      };
      if (card.type === "meeting") {
        patch.meetingDate = form.meetingDate;
        patch.meetingTime = form.meetingTime;
        patch.meetingUrl  = form.meetingUrl;
        patch.duration    = form.duration;
        patch.company     = form.company.trim();
      }
      await onUpdate(card.id, patch);
      setEditing(false);
    } catch (err) {
      console.error("[TaskDetailDrawer] Failed to save:", err);
      setSaveError(getErrorMessage(err, "Failed to save. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!card) return;
    setSaving(true);
    setSaveError("");
    try {
      await onDelete(card.id);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      console.error("[TaskDetailDrawer] Failed to delete:", err);
      setSaveError(getErrorMessage(err, "Failed to delete. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setEditing(false);
    setConfirmDelete(false);
    onClose();
  }

  if (!card) return null;

  const TODAY          = todayStr();
  const isOverdue      = !card.dueDateTbd && card.dueDate && card.dueDate < TODAY && card.column !== "done";
  const isProjectCard  = card.id.startsWith("proj-");
  const priorityStyle  = PRIORITY_STYLES[card.priority] ?? PRIORITY_STYLES.medium;
  const platformCfg    = card.platform ? PLATFORM_CONFIG[card.platform] : null;

  /* ── Edit mode ─────────────────────────────────────────────────────────── */
  if (editing) {
    return (
      <Drawer
        open={open}
        onClose={handleClose}
        title="Edit Task"
        subtitle="Update task details"
        footer={
          <>
            <button
              onClick={() => setEditing(false)}
              className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
              className="bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#333] disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {saveError && (
            <div className="bg-[#fff5f5] border border-[#fecaca] text-[#dc2626] text-sm px-4 py-3 rounded-lg">
              {saveError}
            </div>
          )}

          <FormField label="Title" required>
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => setF("title", e.target.value)}
            />
          </FormField>

          <FormField label="Description">
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              value={form.description}
              onChange={(e) => setF("description", e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Column">
              <Select
                value={form.column}
                onChange={(v) => setF("column", v as KanbanColumn)}
                options={[
                  { value: "backlog", label: "Backlog" },
                  { value: "in-progress", label: "In Progress" },
                  { value: "review", label: "In Review" },
                  { value: "done", label: "Done" },
                ]}
              />
            </FormField>
            <FormField label="Priority">
              <Select
                value={form.priority}
                onChange={(v) => setF("priority", v as KanbanPriority)}
                options={[
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "low", label: "Low" },
                ]}
              />
            </FormField>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-[#444]">
                Due Date
                {!form.dueDateTbd && <span className="text-[#f31260] ml-0.5">*</span>}
              </span>
              <button
                type="button"
                onClick={() => setF("dueDateTbd", !form.dueDateTbd)}
                className="flex items-center gap-1.5 text-[10px] text-[#999] hover:text-[#555] transition-colors select-none"
              >
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                  form.dueDateTbd
                    ? "bg-[#0a0a0a] border-[#0a0a0a]"
                    : "border-[#d4d4d4] hover:border-[#999]"
                }`}>
                  {form.dueDateTbd && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                To be decided
              </button>
            </div>
            {form.dueDateTbd ? (
              <div className="flex items-center h-9 px-3 rounded-lg border border-dashed border-[#e0e0e0] bg-[#fafafa] text-sm text-[#bbb]">
                Will be set later
              </div>
            ) : (
              <DateTimePicker
                dateOnly
                value={form.dueDate}
                onChange={(v) => setF("dueDate", v)}
              />
            )}
          </div>

          {card.type === "meeting" && (
            <>
              <FormField label="Company" hint="Who this meeting is with — leave blank to auto-detect from attendee emails">
                <input
                  className={inputClass}
                  placeholder="e.g. Acme Corp"
                  value={form.company}
                  onChange={(e) => setF("company", e.target.value)}
                />
              </FormField>
              <FormField label="Meeting Date">
                <DateTimePicker
                  dateOnly
                  value={form.meetingDate}
                  onChange={(v) => setF("meetingDate", v)}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Time">
                  <input
                    type="time"
                    className={inputClass}
                    value={form.meetingTime}
                    onChange={(e) => setF("meetingTime", e.target.value)}
                  />
                </FormField>
                <FormField label="Duration (min)">
                  <input
                    type="number"
                    className={inputClass}
                    value={form.duration}
                    min={5}
                    step={5}
                    onChange={(e) => setF("duration", Number(e.target.value))}
                  />
                </FormField>
              </div>
              <FormField label="Meeting URL">
                <input
                  type="url"
                  className={inputClass}
                  placeholder="https://..."
                  value={form.meetingUrl}
                  onChange={(e) => setF("meetingUrl", e.target.value)}
                />
              </FormField>
            </>
          )}

          <FormField label="Tags" hint="Comma-separated, e.g. Engineering, Bug, Urgent">
            <input
              className={inputClass}
              placeholder="Engineering, Bug, Urgent"
              value={form.tagsStr}
              onChange={(e) => setF("tagsStr", e.target.value)}
            />
          </FormField>

          <div className="border-t border-[#f7f7f7] pt-4">
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">
              Assign To
              {form.assignees.length > 0 && (
                <span className="ml-2 normal-case font-normal text-[#0070f3]">
                  {form.assignees.length} selected
                </span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {employees.map((emp) => {
              const selected = form.assignees.includes(emp.name);
              const colors   = getAvatarColor(emp.name);
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => toggleAssignee(emp.name)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    selected
                      ? "border-[#0070f3] bg-[#e8f2ff]"
                      : "border-[#eaeaea] hover:border-[#ccc] hover:bg-[#fafafa]"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full ${
                      selected ? "bg-[#0070f3]" : colors.bg
                    } ${selected ? "text-white" : colors.text} flex items-center justify-center shrink-0`}
                  >
                    <span className="text-[10px] font-semibold">{getInitials(emp.name)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-medium truncate ${selected ? "text-[#0070f3]" : "text-[#0a0a0a]"}`}>
                      {emp.name}
                    </p>
                    <p className="text-[10px] text-[#999] truncate">{emp.department}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Drawer>
    );
  }

  /* ── View mode ─────────────────────────────────────────────────────────── */
  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title={card.title}
      subtitle={`${card.type === "meeting" ? "Meeting" : card.type === "project" ? "Project" : "Task"} · ${COLUMN_LABELS[card.column]}`}
      footer={
        isProjectCard ? (
          card.projectId ? (
            <Link
              href={`/projects/${card.projectId}`}
              className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#333] transition-colors"
            >
              <FolderKanban className="w-3.5 h-3.5" /> View Project
            </Link>
          ) : null
        ) : confirmDelete ? (
          <>
            <span className="text-xs text-[#666] mr-auto">This cannot be undone.</span>
            <button
              onClick={() => setConfirmDelete(false)}
              className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="bg-[#ef4444] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#dc2626] disabled:opacity-50 transition-colors"
            >
              {saving ? "Deleting…" : "Delete"}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-sm font-medium text-[#666] px-4 py-2 rounded-lg hover:bg-[#fef2f2] hover:text-[#ef4444] hover:border-[#fecaca] transition-colors mr-auto"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#333] transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          </>
        )
      }
    >
      <div className="space-y-5">
        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
            card.type === "meeting" ? "bg-[#eff6ff] text-[#2563eb]" :
            card.type === "project" ? "bg-[#f0fdf4] text-[#16a34a]" :
            "bg-[#f5f5f5] text-[#666]"
          }`}>
            {card.type}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-[#f5f5f5] text-[#666]">
            {COLUMN_LABELS[card.column]}
          </span>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${priorityStyle.dot}`} />
            <span className={`text-[11px] font-medium ${priorityStyle.text}`}>{priorityStyle.label} Priority</span>
          </div>
          {isOverdue && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[#ef4444] bg-[#fef2f2] px-2.5 py-1 rounded-full">
              <AlertCircle className="w-3 h-3" /> Overdue
            </span>
          )}
          {card.column === "done" && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[#16a34a] bg-[#f0fdf4] px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> Complete
            </span>
          )}
        </div>

        {/* Description */}
        {card.description && (
          <div>
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-2">Description</p>
            <p className="text-sm text-[#444] leading-relaxed whitespace-pre-wrap">{card.description}</p>
          </div>
        )}

        {/* Meeting details */}
        {card.type === "meeting" && (
          <div className="bg-[#fafafa] border border-[#eaeaea] rounded-xl p-4 space-y-2.5">
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest">Meeting Details</p>
            {card.company && (
              <div className="flex items-center gap-2 text-sm text-[#444]">
                <Building2 className="w-3.5 h-3.5 text-[#999] shrink-0" />
                <span>{card.company}</span>
              </div>
            )}
            {platformCfg && (
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: platformCfg.color }}
                >
                  {platformCfg.letter === "📍" ? "📍" : platformCfg.letter}
                </span>
                <span className="text-sm font-medium text-[#0a0a0a]">{platformCfg.label}</span>
              </div>
            )}
            {card.meetingDate && (
              <div className="flex items-center gap-2 text-sm text-[#444]">
                <Clock className="w-3.5 h-3.5 text-[#999] shrink-0" />
                <span>
                  {fmtDate(card.meetingDate)}
                  {card.meetingTime && ` at ${fmtTime(card.meetingTime)}`}
                  {card.duration && ` · ${card.duration}min`}
                </span>
              </div>
            )}
            {card.meetingUrl && (
              <a
                href={card.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0070f3] hover:underline"
              >
                <Video className="w-3.5 h-3.5" /> Join Meeting <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Project progress */}
        {card.type === "project" && card.progress !== undefined && (
          <div>
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-2">Progress</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-[#f1f1f1] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${card.column === "done" ? "bg-[#22c55e]" : "bg-[#0070f3]"}`}
                  style={{ width: `${card.progress}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-[#0a0a0a] tabular-nums">{card.progress}%</span>
            </div>
          </div>
        )}

        {/* Due date */}
        <div>
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-2">Due Date</p>
          {card.dueDateTbd ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-[#f5f5f5] text-[#888] px-2.5 py-1 rounded-full">
              To be decided
            </span>
          ) : (
            <div className={`flex items-center gap-2 text-sm ${isOverdue ? "text-[#ef4444] font-medium" : "text-[#444]"}`}>
              <Clock className="w-3.5 h-3.5 shrink-0" />
              {card.dueDate ? fmtDate(card.dueDate) : "No due date set"}
              {isOverdue && " · Overdue"}
            </div>
          )}
        </div>

        {/* Tags */}
        {card.tags.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {card.tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 bg-[#f5f5f5] text-[#555] rounded-full"
                >
                  <Tag className="w-2.5 h-2.5" /> {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Assignees */}
        <div>
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-2">Assigned To</p>
          {card.assignees.length === 0 ? (
            <p className="text-sm text-[#bbb]">Unassigned</p>
          ) : (
            <div className="space-y-2">
              {card.assignees.map((name) => {
                const colors = getAvatarColor(name);
                return (
                  <div key={name} className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}>
                      <span className="text-[10px] font-semibold">{getInitials(name)}</span>
                    </div>
                    <span className="text-sm text-[#0a0a0a] font-medium">{name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
