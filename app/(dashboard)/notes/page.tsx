"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/layout/Header";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import { useEmployees } from "@/lib/db/employees";
import { useNotes, addNote, updateNote, removeNote, type Note } from "@/lib/db/notes";
import { useCurrentEmployeeId } from "@/lib/hooks/use-current-employee-id";
import { getAvatarColor, getInitials, getErrorMessage } from "@/lib/utils";
import {
  Plus, Search, Send, Trash2, Check, AlertCircle, X, StickyNote as StickyNoteIcon,
} from "lucide-react";

type ViewFilter = "mine" | "shared";
type SaveState = "idle" | "saving" | "saved";

function newId() {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function Avatar({ name, size = "sm", ring = false }: { name: string; size?: "sm" | "md"; ring?: boolean }) {
  const c = getAvatarColor(name);
  const box = size === "md" ? "w-6 h-6" : "w-5 h-5";
  const text = size === "md" ? "text-[9px]" : "text-[8px]";
  return (
    <div
      title={name}
      className={`${box} rounded-full ${c.bg} ${c.text} flex items-center justify-center shrink-0 ${ring ? "ring-2 ring-white" : ""}`}
    >
      <span className={`${text} font-semibold`}>{getInitials(name)}</span>
    </div>
  );
}

export default function NotesPage() {
  const { authUser } = useAuth();
  const employees = useEmployees();
  const notes = useNotes();

  const myId = useCurrentEmployeeId();
  const myName = authUser?.displayName || authUser?.email || "Me";

  const [filter, setFilter] = useState<ViewFilter>("mine");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  const selected = notes.find((n) => n.id === selectedId) ?? null;
  const isMine = selected ? selected.authorId === myId : false;

  const myNotes = useMemo(() => notes.filter((n) => n.authorId === myId), [notes, myId]);
  const sharedWithMe = useMemo(
    () => notes.filter((n) => n.authorId !== myId && n.recipientIds.includes(myId)),
    [notes, myId]
  );
  const visibleNotes = filter === "mine" ? myNotes : sharedWithMe;
  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleNotes;
    return visibleNotes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  }, [visibleNotes, search]);

  useEffect(() => {
    setDraftTitle(selected?.title ?? "");
    setDraftBody(selected?.body ?? "");
    setShareOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Falls back cleanly if the selected note is deleted from elsewhere.
  useEffect(() => {
    if (selectedId && !notes.some((n) => n.id === selectedId)) setSelectedId(null);
  }, [notes, selectedId]);

  // Edits save on blur, which is invisible — drop the "Saved" tick shortly
  // after so the editor doesn't wear a stale confirmation indefinitely.
  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

  // Close the share popover on an outside click, the way every other popover
  // in the app behaves.
  const shareRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shareOpen) return;
    function onDown(e: MouseEvent) {
      if (!shareRef.current?.contains(e.target as Node)) setShareOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [shareOpen]);

  // Safety net beyond onBlur — flushes unsaved title/body edits whenever the
  // selection changes or the page is left, so switching notes (or navigating
  // away) via something other than a plain blur never silently drops edits.
  const draftRef = useRef({ id: "", title: "", body: "", authorId: "" });
  useEffect(() => {
    draftRef.current = { id: selected?.id ?? "", title: draftTitle, body: draftBody, authorId: selected?.authorId ?? "" };
  });
  useEffect(() => {
    return () => {
      const d = draftRef.current;
      if (!d.id || d.authorId !== myId) return;
      const original = notes.find((n) => n.id === d.id);
      if (!original) return;
      if (d.title !== original.title || d.body !== original.body) {
        updateNote(d.id, { title: d.title, body: d.body, updatedAt: new Date().toISOString() }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleCreate() {
    // Notes are keyed on an employee id, so an account with no matching
    // employee record can't author one. Say so rather than no-op'ing — a
    // button that does nothing at all is indistinguishable from a broken page.
    if (!myId) {
      setError(
        "Your account isn't linked to an employee record, so notes can't be created. Ask an admin to link it under Settings › Team.",
      );
      return;
    }
    const now = new Date().toISOString();
    const note: Note = {
      id: newId(),
      title: "",
      body: "",
      authorId: myId,
      authorName: myName,
      recipientIds: [],
      createdAt: now,
      updatedAt: now,
    };
    try {
      await addNote(note);
      setFilter("mine");
      setSelectedId(note.id);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create note"));
    }
  }

  async function persist(patch: Partial<Note>) {
    if (!selected) return;
    setSaveState("saving");
    try {
      await updateNote(selected.id, { ...patch, updatedAt: new Date().toISOString() });
      setSaveState("saved");
    } catch (err) {
      setSaveState("idle");
      setError(getErrorMessage(err, "Failed to save note"));
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setDeleting(true);
    try {
      await removeNote(selected.id);
      setSelectedId(null);
      setConfirmDelete(false);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete note"));
    } finally {
      setDeleting(false);
    }
  }

  function toggleRecipient(employeeId: string) {
    if (!selected) return;
    const next = selected.recipientIds.includes(employeeId)
      ? selected.recipientIds.filter((id) => id !== employeeId)
      : [...selected.recipientIds, employeeId];
    persist({ recipientIds: next });
  }

  const recipientEmployees = employees.filter((e) => selected?.recipientIds.includes(e.id));

  return (
    <div>
      <Header
        title="Notes"
        subtitle="Personal notes, keep them to yourself or share with a teammate"
        actions={
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Note
          </button>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[#fef2f2] border border-[#fecaca]">
          <AlertCircle className="w-4 h-4 text-[#b91c1c] shrink-0 mt-px" />
          <p className="text-[13px] text-[#b91c1c] flex-1">{error}</p>
          <button
            onClick={() => setError("")}
            className="text-[#b91c1c] hover:opacity-70 transition-opacity shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="bg-white border border-[#eaeaea] rounded-xl flex h-[calc(100vh-220px)] min-h-[480px] overflow-hidden">
        {/* List pane */}
        <div className="w-[300px] lg:w-[340px] shrink-0 border-r border-[#eaeaea] flex flex-col">
          <div className="p-3 border-b border-[#eaeaea] space-y-2.5 shrink-0">
            <div className="flex items-center gap-0.5 bg-[#f5f5f5] rounded-lg p-0.5">
              {([
                { key: "mine", label: "My Notes", count: myNotes.length },
                { key: "shared", label: "Shared", count: sharedWithMe.length },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
                    filter === t.key
                      ? "bg-[#0a0a0a] text-white"
                      : "text-[#888] hover:text-[#0a0a0a]"
                  }`}
                >
                  {t.label}
                  <span className={`ml-1.5 text-[10px] font-semibold tabular-nums ${filter === t.key ? "opacity-60" : "text-[#ccc]"}`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#bbb] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes…"
                className="w-full pl-9 pr-3 py-2 text-[13px] rounded-lg border border-[#eaeaea] bg-white text-[#0a0a0a] placeholder:text-[#bbb] focus:outline-none focus:border-[#0070f3] transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <div className="py-16 px-6 text-center">
                <StickyNoteIcon className="w-5 h-5 text-[#ccc] mx-auto mb-2.5" />
                <p className="text-[13px] font-medium text-[#0a0a0a] mb-1">
                  {search.trim()
                    ? "No matches"
                    : filter === "mine"
                      ? "No notes yet"
                      : "Nothing shared with you"}
                </p>
                <p className="text-xs text-[#999]">
                  {search.trim()
                    ? `Nothing matches “${search.trim()}”.`
                    : filter === "mine"
                      ? "Create one to get started."
                      : "Notes teammates share will appear here."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#f4f4f4]">
                {filteredNotes.map((n) => {
                  const active = n.id === selectedId;
                  const sharedTo = employees.filter((e) => n.recipientIds.includes(e.id));
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => setSelectedId(n.id)}
                        className={`relative w-full text-left px-4 py-3 transition-colors ${
                          active ? "bg-[#f5f5f5]" : "hover:bg-[#fafafa]"
                        }`}
                      >
                        {/* Accent rail marks the open note without shifting layout */}
                        <span
                          className={`absolute left-0 top-0 bottom-0 w-[2px] ${active ? "bg-[#0a0a0a]" : "bg-transparent"}`}
                        />
                        <p className={`text-[13px] truncate mb-1 ${active ? "font-semibold text-[#0a0a0a]" : "font-medium text-[#333]"}`}>
                          {n.title || "Untitled note"}
                        </p>
                        <p className="text-xs text-[#999] line-clamp-2 leading-relaxed mb-2">
                          {n.body || "No content"}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-[#bbb] tabular-nums">{formatTimestamp(n.updatedAt)}</p>
                          <div className="ml-auto flex items-center gap-1.5">
                            {filter === "shared" ? (
                              <Avatar name={n.authorName || "Unknown"} />
                            ) : sharedTo.length > 0 ? (
                              <>
                                <Send className="w-3 h-3 text-[#bbb]" />
                                <div className="flex -space-x-1.5">
                                  {sharedTo.slice(0, 3).map((e) => (
                                    <Avatar key={e.id} name={e.name} ring />
                                  ))}
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Editor pane */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <div className="w-11 h-11 rounded-xl bg-[#fafafa] border border-[#eaeaea] flex items-center justify-center mx-auto mb-3">
                  <StickyNoteIcon className="w-5 h-5 text-[#ccc]" />
                </div>
                <p className="text-sm font-medium text-[#0a0a0a] mb-1">No note selected</p>
                <p className="text-xs text-[#999] mb-4 max-w-[260px] mx-auto">
                  Pick one from the list, or start a new note.
                </p>
                <button
                  onClick={handleCreate}
                  className="inline-flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#0a0a0a] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Note
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-[#eaeaea] shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  {!isMine && <Avatar name={selected.authorName || "Unknown"} size="md" />}
                  <p className="text-[11px] text-[#999] truncate">
                    {isMine
                      ? `Last edited ${formatTimestamp(selected.updatedAt)}`
                      : `${selected.authorName} · ${formatTimestamp(selected.updatedAt)}`}
                  </p>
                  {isMine && saveState !== "idle" && (
                    <span className="flex items-center gap-1 text-[11px] text-[#999] shrink-0">
                      {saveState === "saving" ? (
                        "Saving…"
                      ) : (
                        <>
                          <Check className="w-3 h-3 text-[#17c964]" />
                          Saved
                        </>
                      )}
                    </span>
                  )}
                </div>

                {isMine && (
                  <div className="flex items-center gap-2 shrink-0" ref={shareRef}>
                    {recipientEmployees.length > 0 && (
                      <div className="flex items-center -space-x-1.5 mr-0.5">
                        {recipientEmployees.slice(0, 4).map((e) => (
                          <Avatar key={e.id} name={e.name} size="md" ring />
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <button
                        onClick={() => setShareOpen((v) => !v)}
                        className={`flex items-center gap-1.5 border text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
                          shareOpen
                            ? "border-[#d4d4d4] bg-[#fafafa] text-[#0a0a0a]"
                            : "border-[#eaeaea] bg-white text-[#0a0a0a] hover:bg-[#fafafa]"
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Share
                      </button>

                      {shareOpen && (
                        <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-[#eaeaea] rounded-xl shadow-lg z-20 p-1.5">
                          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider px-2.5 py-2">
                            Share with
                          </p>
                          <div className="max-h-64 overflow-y-auto space-y-0.5">
                            {employees.filter((e) => e.id !== myId).length === 0 ? (
                              <p className="text-xs text-[#999] px-2.5 py-3 text-center">No teammates yet</p>
                            ) : (
                              employees.filter((e) => e.id !== myId).map((e) => {
                                const checked = selected.recipientIds.includes(e.id);
                                return (
                                  <button
                                    key={e.id}
                                    onClick={() => toggleRecipient(e.id)}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors text-left"
                                  >
                                    <Avatar name={e.name} size="md" />
                                    <span className="text-[13px] text-[#0a0a0a] flex-1 truncate">{e.name}</span>
                                    {checked && <Check className="w-3.5 h-3.5 text-[#0070f3] shrink-0" />}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="p-1.5 rounded-lg text-[#999] hover:bg-[#fef2f2] hover:text-[#f31260] transition-colors"
                      title="Delete note"
                      aria-label="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="max-w-3xl">
                  {isMine ? (
                    <>
                      <input
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onBlur={() => draftTitle !== selected.title && persist({ title: draftTitle })}
                        placeholder="Untitled note"
                        className="w-full text-2xl font-semibold tracking-tight text-[#0a0a0a] placeholder:text-[#ccc] focus:outline-none mb-4 bg-transparent"
                      />
                      <textarea
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        onBlur={() => draftBody !== selected.body && persist({ body: draftBody })}
                        placeholder="Start writing…"
                        className="w-full h-full min-h-[320px] resize-none text-sm text-[#333] placeholder:text-[#ccc] focus:outline-none leading-[1.7] bg-transparent"
                      />
                    </>
                  ) : (
                    <>
                      <h2 className="text-2xl font-semibold tracking-tight text-[#0a0a0a] mb-4">
                        {selected.title || "Untitled note"}
                      </h2>
                      <p className="text-sm text-[#333] whitespace-pre-wrap leading-[1.7]">
                        {selected.body || "No content"}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this note?"
        description={
          selected?.recipientIds.length
            ? "It will also disappear for everyone you shared it with. This can't be undone."
            : "This can't be undone."
        }
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
