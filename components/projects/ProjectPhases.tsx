"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChevronDown, Plus, Trash2, Link2, FileText,
  User, ImageIcon, StickyNote, AlertCircle, X, ExternalLink,
  Download, Upload,
} from "lucide-react";
import { storeFile, retrieveFile, removeStoredFile, formatFileSize } from "@/lib/file-storage";
import { logActivity } from "@/lib/activity-log";
import type { Project } from "@/lib/mock-projects";
import { updateProject } from "@/lib/db/projects";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  PHASE_DEFS, computeProgress, seedFromProject, emptyPhasesState,
} from "@/lib/project-phases";
import type {
  PhaseStatus, AttachmentType, Attachment, PhaseData, PhasesState,
} from "@/lib/project-phases";

// Re-exported so existing external import sites keep working unchanged.
export type { PhaseStatus, AttachmentType, Attachment, PhaseData, PhasesState } from "@/lib/project-phases";
export { PHASE_DEFS, computeProgress } from "@/lib/project-phases";

// ─── Style maps ────────────────────────────────────────────────────────────────

const phaseSC: Record<PhaseStatus, { label: string; bg: string; text: string; ring: string }> = {
  "not-started": { label: "Not Started", bg: "bg-[#f1f1f1]", text: "text-[#999]",    ring: "border-[#ddd]"    },
  "in-progress": { label: "In Progress", bg: "bg-[#e8f2ff]", text: "text-[#0070f3]", ring: "border-[#0070f3]" },
  completed:     { label: "Completed",   bg: "bg-[#e8fdf0]", text: "text-[#17c964]", ring: "border-[#17c964]" },
  blocked:       { label: "Blocked",     bg: "bg-[#fff0f5]", text: "text-[#f31260]", ring: "border-[#f31260]" },
};

const attCfg: Record<AttachmentType, { label: string; color: string }> = {
  link:    { label: "Link",    color: "#0070f3" },
  file:    { label: "File",    color: "#7c3aed" },
  contact: { label: "Contact", color: "#0ea5e9" },
  media:   { label: "Media",   color: "#f5a524" },
  note:    { label: "Note",    color: "#666"    },
};

const fieldCls =
  "w-full border border-[#eaeaea] rounded-lg px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#bbb] focus:outline-none focus:border-[#0070f3] transition-colors bg-[#fafafa] focus:bg-white";

// Supabase writes for phases can transiently fail (network blips, VPN/proxy
// hiccups) and will just retry next time the project is opened — that's by
// design, not data loss. Avoid re-logging the same failure every mount.
const loggedPhaseSyncFailures = new Set<string>();
function logPhaseSyncFailureOnce(projectId: string, message: string, err: unknown) {
  if (loggedPhaseSyncFailures.has(projectId)) return;
  loggedPhaseSyncFailures.add(projectId);
  console.error(message, err);
}

// ─── Main component ─────────────────────────────────────────────────────────────

type AddingState = {
  phaseId: string;
  type: AttachmentType;
  form: Record<string, string>;
  selectedFile?: File;
} | null;

interface Props {
  projectId: string;
  initialProject?: Project;
  onProgressChange?: (p: number) => void;
  onPhasesChange?: (phases: PhasesState) => void;
}

export default function ProjectPhases({ projectId, initialProject, onProgressChange, onPhasesChange }: Props) {
  const [phases, setPhases] = useState<PhasesState>(emptyPhasesState);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<AddingState>(null);
  const [pendingRemove, setPendingRemove] = useState<{ phaseId: string; attId: string; label: string } | null>(null);

  const phasesRef = useRef(phases);
  useEffect(() => {
    phasesRef.current = phases;
  }, [phases]);
  const descTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function apply(next: PhasesState) {
    setPhases(next);
    onProgressChange?.(computeProgress(next));
    onPhasesChange?.(next);
  }

  useEffect(() => {
    let cancelled = false;

    if (initialProject?.phases) {
      apply(initialProject.phases);
      return () => { cancelled = true; };
    }

    const legacyKey = `project_phases_${projectId}`;
    const stored = localStorage.getItem(legacyKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as PhasesState;
        if (!cancelled) apply(parsed);
        // Self-healing one-time migration off localStorage — only drop the
        // legacy copy once it's confirmed saved to Supabase.
        updateProject(projectId, { phases: parsed })
          .then(() => localStorage.removeItem(legacyKey))
          .catch((err) => logPhaseSyncFailureOnce(projectId, "[ProjectPhases] migration to Supabase failed, keeping localStorage copy", err));
        return () => { cancelled = true; };
      } catch {}
    }

    // No stored data anywhere — seed from the project's own fields and persist it,
    // so a second device opening this project later doesn't independently reseed.
    const seeded = initialProject ? seedFromProject(initialProject) : emptyPhasesState();
    if (!cancelled) apply(seeded);
    updateProject(projectId, { phases: seeded }).catch((err) => logPhaseSyncFailureOnce(projectId, "[ProjectPhases] failed to save seeded phases", err));

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Flush any pending debounced description writes on unmount/project switch.
  useEffect(() => {
    return () => {
      const timers = descTimers.current;
      const ids = Object.keys(timers);
      if (ids.length === 0) return;
      ids.forEach((id) => clearTimeout(timers[id]));
      descTimers.current = {};
      updateProject(projectId, { phases: phasesRef.current }).catch(() => {});
    };
  }, [projectId]);

  function persist(next: PhasesState) {
    updateProject(projectId, { phases: next }).catch((err) =>
      logPhaseSyncFailureOnce(projectId, "[ProjectPhases] failed to save phases", err)
    );
  }

  function updatePhase(id: string, patch: Partial<PhaseData>) {
    // Log status transitions only (not every keystroke in description)
    if (patch.status && patch.status !== phases[id]?.status) {
      const phaseDef = PHASE_DEFS.find((d) => d.id === id);
      logActivity({
        category: "projects",
        action: "Phase status changed",
        detail: `Phase "${phaseDef?.label ?? id}" changed from "${phases[id]?.status ?? "not-started"}" to "${patch.status}" on project ${projectId}`,
        metadata: { projectId, phaseId: id, from: phases[id]?.status ?? "not-started", to: patch.status },
      });
    }

    const next = { ...phases, [id]: { ...phases[id], ...patch } };
    apply(next);

    const isDescOnly = Object.keys(patch).length === 1 && "description" in patch;
    if (isDescOnly) {
      // Keystroke-driven — debounce so we don't hit Supabase on every character.
      clearTimeout(descTimers.current[id]);
      descTimers.current[id] = setTimeout(() => {
        delete descTimers.current[id];
        persist(next);
      }, 600);
    } else {
      // Discrete, infrequent action (status change, attachment add/remove) — persist immediately.
      clearTimeout(descTimers.current[id]);
      delete descTimers.current[id];
      persist(next);
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function commitAdd(selectedFile?: File) {
    if (!adding) return;
    const { phaseId, type, form } = adding;

    let fileStorageId: string | undefined;
    let fileName: string | undefined;
    let fileSize: number | undefined;
    let fileType: string | undefined;

    if (selectedFile) {
      // eslint-disable-next-line react-hooks/purity -- only ever invoked from a user event handler, never during render
      fileStorageId = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await storeFile(fileStorageId, selectedFile);
      fileName = selectedFile.name;
      fileSize = selectedFile.size;
      fileType = selectedFile.type;
    }

    const att: Attachment = {
      // eslint-disable-next-line react-hooks/purity -- only ever invoked from a user event handler, never during render
      id: `att-${Date.now()}`,
      type,
      label: form.label || fileName || form.contactName || "Untitled",
      url: form.url || undefined,
      fileStorageId,
      fileName,
      fileSize,
      fileType,
      contactName:  form.contactName  || undefined,
      contactRole:  form.contactRole  || undefined,
      contactEmail: form.contactEmail || undefined,
      contactPhone: form.contactPhone || undefined,
      content: form.content || undefined,
      addedAt: new Date().toISOString(),
    };

    updatePhase(phaseId, { attachments: [...phases[phaseId].attachments, att] });
    setAdding(null);
  }

  function removeAttachment(phaseId: string, attId: string) {
    const att = phases[phaseId].attachments.find((a) => a.id === attId);
    if (att?.fileStorageId) {
      removeStoredFile(att.fileStorageId).catch(() => {});
    }
    updatePhase(phaseId, {
      attachments: phases[phaseId].attachments.filter((a) => a.id !== attId),
    });
  }

  const completedCount = PHASE_DEFS.filter((d) => phases[d.id]?.status === "completed").length;
  const progress = computeProgress(phases);

  return (
    <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-4 border-b border-[#f1f1f1]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-[#0a0a0a]">Project Phases</p>
            <p className="text-xs text-[#999] mt-0.5">
              {completedCount} of {PHASE_DEFS.length} phases complete
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {PHASE_DEFS.map((d) => {
              const s = phases[d.id]?.status ?? "not-started";
              return (
                <div
                  key={d.id}
                  title={`${d.label}: ${phaseSC[s].label}`}
                  className="w-2 h-2 rounded-full transition-colors"
                  style={{
                    backgroundColor:
                      s === "completed"   ? "#17c964" :
                      s === "in-progress" ? "#0070f3" :
                      s === "blocked"     ? "#f31260" :
                      "#eaeaea",
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-[#f1f1f1] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: progress === 100 ? "#17c964" : "#0070f3" }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums text-[#0a0a0a] shrink-0">{progress}%</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-5 py-4 space-y-2">
        {PHASE_DEFS.map((def, i) => {
          const phase = phases[def.id];
          const sc = phaseSC[phase.status];
          const isOpen = expanded.has(def.id);
          const isLast = i === PHASE_DEFS.length - 1;

          return (
            <div key={def.id} className="flex gap-3">
              {/* Circle + connector */}
              <div className="flex flex-col items-center shrink-0 w-7.5">
                <div className={`w-7.5 h-7.5 rounded-full border-2 flex items-center justify-center bg-white ${sc.ring}`}>
                  {phase.status === "completed" ? (
                    <svg className="w-3.5 h-3.5 text-[#17c964]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : phase.status === "blocked" ? (
                    <AlertCircle className="w-3.5 h-3.5 text-[#f31260]" />
                  ) : phase.status === "in-progress" ? (
                    <div className="w-2 h-2 rounded-full bg-[#0070f3]" />
                  ) : (
                    <span className="text-[11px] font-bold text-[#bbb]">{def.num}</span>
                  )}
                </div>
                {!isLast && (
                  <div
                    className="w-px flex-1 mt-1.5 min-h-3"
                    style={{
                      backgroundColor:
                        phase.status === "completed"   ? "#17c964" :
                        phase.status === "in-progress" ? "#93c5fd" :
                        "#eaeaea",
                    }}
                  />
                )}
              </div>

              {/* Card */}
              <div className="flex-1 min-w-0 pb-1">
                <button
                  onClick={() => toggleExpanded(def.id)}
                  className="w-full flex items-start justify-between gap-2 text-left group py-1"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#0a0a0a]">{def.label}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
                        {sc.label}
                      </span>
                      {phase.attachments.length > 0 && (
                        <span className="text-[10px] text-[#999] bg-[#f7f7f7] border border-[#eaeaea] px-1.5 py-0.5 rounded-full">
                          {phase.attachments.length} item{phase.attachments.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {!isOpen && (
                      <p className="text-xs text-[#999] mt-0.5 truncate max-w-md">
                        {phase.description
                          ? phase.description
                          : <span className="italic text-[#ccc]">{def.hint.slice(0, 58)}…</span>
                        }
                      </p>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-[#bbb] shrink-0 mt-0.5 transition-transform group-hover:text-[#666] ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="mt-2 border border-[#eaeaea] rounded-xl overflow-hidden shadow-sm">
                    {/* Status */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-[#fafafa] border-b border-[#f1f1f1] flex-wrap">
                      <span className="text-[10px] font-semibold text-[#999] uppercase tracking-wider shrink-0">Status</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(["not-started", "in-progress", "completed", "blocked"] as PhaseStatus[]).map((s) => {
                          const c = phaseSC[s];
                          return (
                            <button
                              key={s}
                              onClick={() => updatePhase(def.id, { status: s })}
                              className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                                phase.status === s
                                  ? `${c.bg} ${c.text} border-current`
                                  : "bg-white text-[#bbb] border-[#eaeaea] hover:text-[#555] hover:border-[#bbb]"
                              }`}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Description */}
                    <div className="px-4 pt-4 pb-3 border-b border-[#f7f7f7]">
                      <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-1">Description</p>
                      <p className="text-[10px] text-[#ccc] italic mb-2 leading-relaxed">{def.hint}</p>
                      <textarea
                        className={`${fieldCls} resize-none`}
                        rows={3}
                        placeholder="Add context, notes, decisions, and key details…"
                        value={phase.description}
                        onChange={(e) => updatePhase(def.id, { description: e.target.value })}
                      />
                    </div>

                    {/* Attachments */}
                    <div className="px-4 pt-3 pb-4">
                      <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-3">
                        Attachments
                        {phase.attachments.length > 0 && (
                          <span className="ml-1.5 normal-case font-normal text-[#bbb]">
                            ({phase.attachments.length})
                          </span>
                        )}
                      </p>

                      {phase.attachments.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {phase.attachments.map((att) => (
                            <AttachmentItem
                              key={att.id}
                              attachment={att}
                              onRemove={() => setPendingRemove({ phaseId: def.id, attId: att.id, label: att.label })}
                            />
                          ))}
                        </div>
                      )}

                      {adding?.phaseId === def.id ? (
                        <AddForm
                          adding={adding}
                          onFormChange={(form) => setAdding({ ...adding, form })}
                          onFileSelect={(file) => setAdding({ ...adding, selectedFile: file })}
                          onSave={commitAdd}
                          onCancel={() => setAdding(null)}
                        />
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {(["link", "file", "contact", "media", "note"] as AttachmentType[]).map((type) => (
                            <button
                              key={type}
                              onClick={() => setAdding({ phaseId: def.id, type, form: {}, selectedFile: undefined })}
                              className="flex items-center gap-1 text-[11px] text-[#666] border border-[#eaeaea] hover:border-[#bbb] hover:bg-[#fafafa] px-2.5 py-1.5 rounded-lg transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              {attCfg[type].label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!pendingRemove}
        title="Remove attachment?"
        description={`"${pendingRemove?.label}" will be permanently removed from this phase. This cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingRemove) removeAttachment(pendingRemove.phaseId, pendingRemove.attId);
          setPendingRemove(null);
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}

// ─── AttachmentItem ────────────────────────────────────────────────────────────

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(url);
}

function AttIcon({ type }: { type: AttachmentType }) {
  const cls = "w-3.5 h-3.5";
  if (type === "link")    return <Link2 className={cls} />;
  if (type === "file")    return <FileText className={cls} />;
  if (type === "contact") return <User className={cls} />;
  if (type === "media")   return <ImageIcon className={cls} />;
  return <StickyNote className={cls} />;
}

function StoredFileItem({ att, onRemove }: { att: Attachment; onRemove: () => void }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let url: string;
    retrieveFile(att.fileStorageId!).then((file) => {
      if (file) {
        url = URL.createObjectURL(file);
        setObjectUrl(url);
      }
      setLoading(false);
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [att.fileStorageId]);

  const isImage = att.fileType?.startsWith("image/");

  return (
    <div className="group flex items-start gap-2.5 bg-[#fafafa] border border-[#eaeaea] rounded-lg px-3 py-2.5 hover:border-[#d4d4d4] transition-colors">
      <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#7c3aed]" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#0a0a0a] truncate">{att.label || att.fileName}</span>
          {att.fileSize !== undefined && (
            <span className="text-[10px] text-[#999] shrink-0">{formatFileSize(att.fileSize)}</span>
          )}
          {!loading && objectUrl && (
            <a
              href={objectUrl}
              download={att.fileName || att.label}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 text-[#0070f3] hover:text-[#0060d0] transition-colors"
              title="Download"
            >
              <Download className="w-3 h-3" />
            </a>
          )}
          {loading && <span className="text-[10px] text-[#bbb]">Loading…</span>}
        </div>
        {att.content && <p className="text-xs text-[#999] mt-0.5">{att.content}</p>}
        {isImage && objectUrl && (
          <img
            src={objectUrl}
            alt={att.label}
            className="mt-2 rounded-lg max-h-48 object-cover border border-[#eaeaea]"
          />
        )}
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-[#999] hover:text-[#f31260] hover:bg-[#fff0f5] transition-all"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function AttachmentItem({ attachment: att, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  if (att.type === "file" && att.fileStorageId) {
    return <StoredFileItem att={att} onRemove={onRemove} />;
  }

  const cfg = attCfg[att.type];

  return (
    <div className="group flex items-start gap-2.5 bg-[#fafafa] border border-[#eaeaea] rounded-lg px-3 py-2.5 hover:border-[#d4d4d4] transition-colors">
      <span className="mt-0.5 shrink-0" style={{ color: cfg.color }}>
        <AttIcon type={att.type} />
      </span>
      <div className="flex-1 min-w-0">
        {att.type === "contact" ? (
          <div>
            <p className="text-sm font-medium text-[#0a0a0a] leading-snug">{att.contactName}</p>
            {att.contactRole && <p className="text-xs text-[#999]">{att.contactRole}</p>}
            <div className="flex flex-wrap gap-3 mt-1">
              {att.contactEmail && (
                <a href={`mailto:${att.contactEmail}`} className="text-xs text-[#0070f3] hover:underline">
                  {att.contactEmail}
                </a>
              )}
              {att.contactPhone && (
                <a href={`tel:${att.contactPhone}`} className="text-xs text-[#444] hover:text-[#0070f3] transition-colors">
                  {att.contactPhone}
                </a>
              )}
            </div>
          </div>
        ) : att.type === "note" ? (
          <p className="text-xs text-[#444] leading-relaxed whitespace-pre-wrap">{att.content}</p>
        ) : att.type === "media" && att.url && isImageUrl(att.url) ? (
          <div>
            <p className="text-xs font-medium text-[#0a0a0a] mb-1.5">{att.label}</p>
            <img
              src={att.url}
              alt={att.label}
              className="rounded-lg max-h-48 object-cover border border-[#eaeaea]"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-[#0a0a0a] truncate">{att.label}</span>
            {att.url && (
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 text-[#0070f3] hover:text-[#0060d0] transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
        {att.content && att.type !== "note" && att.type !== "file" && (
          <p className="text-xs text-[#999] mt-0.5">{att.content}</p>
        )}
        {att.type === "media" && att.url && !isImageUrl(att.url) && (
          <a
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#0070f3] hover:underline flex items-center gap-1 mt-0.5"
          >
            Open link <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-[#999] hover:text-[#f31260] hover:bg-[#fff0f5] transition-all"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── AddForm ──────────────────────────────────────────────────────────────────

interface AddFormProps {
  adding: { phaseId: string; type: AttachmentType; form: Record<string, string>; selectedFile?: File };
  onFormChange: (form: Record<string, string>) => void;
  onFileSelect: (file: File | undefined) => void;
  onSave: (selectedFile?: File) => void;
  onCancel: () => void;
}

function AddForm({ adding, onFormChange, onFileSelect, onSave, onCancel }: AddFormProps) {
  const { type, form, selectedFile } = adding;
  const cfg = attCfg[type];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function set(key: string, value: string) {
    onFormChange({ ...form, [key]: value });
  }

  function handleFilePick(file: File) {
    onFileSelect(file);
    if (!form.label) set("label", file.name.replace(/\.[^.]+$/, ""));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFilePick(file);
  }

  const canSave =
    type === "contact" ? !!form.contactName?.trim() :
    type === "note"    ? !!form.content?.trim() :
    type === "file"    ? !!(selectedFile || form.label?.trim()) :
    !!form.label?.trim();

  return (
    <div className="border border-[#eaeaea] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 bg-[#fafafa] border-b border-[#eaeaea]">
        <div className="flex items-center gap-1.5">
          <span style={{ color: cfg.color }}><AttIcon type={type} /></span>
          <span className="text-xs font-semibold" style={{ color: cfg.color }}>Add {cfg.label}</span>
        </div>
        <button onClick={onCancel} className="p-1 rounded text-[#bbb] hover:text-[#444] hover:bg-[#eaeaea] transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        {type === "link" && (
          <>
            <input className={fieldCls} placeholder="Label (e.g. Figma Prototype)" value={form.label ?? ""} onChange={(e) => set("label", e.target.value)} autoFocus />
            <input className={fieldCls} placeholder="URL (https://…)" value={form.url ?? ""} onChange={(e) => set("url", e.target.value)} />
          </>
        )}

        {type === "file" && (
          <>
            {/* Drop zone / file picker */}
            {selectedFile ? (
              <div className="flex items-center gap-2.5 bg-[#f3eeff] border border-[#c4b5fd] rounded-lg px-3 py-2.5">
                <FileText className="w-4 h-4 text-[#7c3aed] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0a0a0a] truncate">{selectedFile.name}</p>
                  <p className="text-[11px] text-[#7c3aed]">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button
                  onClick={() => { onFileSelect(undefined); set("label", ""); }}
                  className="text-[#bbb] hover:text-[#f31260] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                  dragging ? "border-[#7c3aed] bg-[#f3eeff]" : "border-[#eaeaea] hover:border-[#c4b5fd] hover:bg-[#fafafa]"
                }`}
              >
                <Upload className="w-5 h-5 mx-auto mb-2 text-[#bbb]" />
                <p className="text-sm font-medium text-[#666]">Click to browse</p>
                <p className="text-xs text-[#bbb] mt-0.5">or drag & drop any file</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFilePick(f);
                  }}
                />
              </div>
            )}
            <input
              className={fieldCls}
              placeholder="Label (auto-filled from file name)"
              value={form.label ?? ""}
              onChange={(e) => set("label", e.target.value)}
            />
            <textarea
              className={`${fieldCls} resize-none`}
              rows={2}
              placeholder="Notes about this file (optional)"
              value={form.content ?? ""}
              onChange={(e) => set("content", e.target.value)}
            />
          </>
        )}

        {type === "contact" && (
          <>
            <input className={fieldCls} placeholder="Full name" value={form.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} autoFocus />
            <input className={fieldCls} placeholder="Role / Title" value={form.contactRole ?? ""} onChange={(e) => set("contactRole", e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className={fieldCls} type="email" placeholder="Email" value={form.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} />
              <input className={fieldCls} type="tel" placeholder="Phone" value={form.contactPhone ?? ""} onChange={(e) => set("contactPhone", e.target.value)} />
            </div>
          </>
        )}

        {type === "media" && (
          <>
            <input className={fieldCls} placeholder="Label (e.g. Demo Recording, Wireframe)" value={form.label ?? ""} onChange={(e) => set("label", e.target.value)} autoFocus />
            <input className={fieldCls} placeholder="URL (image, YouTube, Loom, etc.)" value={form.url ?? ""} onChange={(e) => set("url", e.target.value)} />
          </>
        )}

        {type === "note" && (
          <textarea
            className={`${fieldCls} resize-none`}
            rows={4}
            placeholder="Write a note, decision, or important context…"
            value={form.content ?? ""}
            onChange={(e) => set("content", e.target.value)}
            autoFocus
          />
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onCancel} className="text-xs text-[#666] px-3 py-1.5 rounded-lg border border-[#eaeaea] hover:bg-[#fafafa] transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave(selectedFile)}
            disabled={!canSave}
            className="text-xs font-medium text-white px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-40"
            style={{ backgroundColor: cfg.color }}
          >
            {type === "file" && selectedFile ? "Upload File" : `Add ${cfg.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
