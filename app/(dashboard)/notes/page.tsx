"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/layout/Header";
import { useAuth } from "@/lib/auth-context";
import { useEmployees } from "@/lib/db/employees";
import { useNotes, addNote, updateNote, removeNote, type Note } from "@/lib/db/notes";
import { getAvatarColor, getInitials, getErrorMessage } from "@/lib/utils";
import { Plus, Search, Send, Trash2, Check, StickyNote as StickyNoteIcon } from "lucide-react";

type ViewFilter = "mine" | "shared";

function newId() {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export default function NotesPage() {
  const { authUser } = useAuth();
  const employees = useEmployees();
  const notes = useNotes();

  const myId = authUser?.employeeId ?? "";
  const myName = authUser?.displayName || authUser?.email || "Me";

  const [filter, setFilter] = useState<ViewFilter>("mine");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState("");

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
    if (!myId) return;
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
    try {
      await updateNote(selected.id, { ...patch, updatedAt: new Date().toISOString() });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save note"));
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm("Delete this note? This can't be undone.")) return;
    try {
      await removeNote(selected.id);
      setSelectedId(null);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete note"));
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
        subtitle="Personal notes — keep them to yourself or share with a teammate"
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
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-[#fdeaea] text-[#f31260] text-sm">{error}</div>
      )}

      <div className="bg-white border border-[#eaeaea] rounded-xl flex h-[calc(100vh-220px)] min-h-[480px] overflow-hidden">
        {/* List pane */}
        <div className="w-[320px] shrink-0 border-r border-[#eaeaea] flex flex-col">
          <div className="p-3 border-b border-[#f0f0f0] space-y-2.5">
            <div className="flex items-center bg-[#f5f5f5] rounded-lg p-0.5">
              {([
                { key: "mine", label: "My Notes" },
                { key: "shared", label: "Shared with Me" },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                    filter === t.key ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#888] hover:text-[#444]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#bbb] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#eaeaea] focus:outline-none focus:border-[#0a0a0a] transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <div className="py-14 px-4 text-center">
                <StickyNoteIcon className="w-5 h-5 text-[#ddd] mx-auto mb-2" />
                <p className="text-xs text-[#999]">
                  {filter === "mine" ? "No notes yet" : "Nothing shared with you yet"}
                </p>
              </div>
            ) : (
              <ul>
                {filteredNotes.map((n) => {
                  const active = n.id === selectedId;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => setSelectedId(n.id)}
                        className={`w-full text-left px-4 py-3 border-b border-[#f5f5f5] transition-colors ${
                          active ? "bg-[#f5f5f5]" : "hover:bg-[#fafafa]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-medium text-[#0a0a0a] truncate">
                            {n.title || "Untitled note"}
                          </p>
                          {n.recipientIds.length > 0 && filter === "mine" && (
                            <Send className="w-3 h-3 text-[#999] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-[#999] truncate">{n.body || "No content"}</p>
                        <p className="text-[10px] text-[#bbb] mt-1.5">
                          {filter === "shared" ? `From ${n.authorName} · ` : ""}
                          {formatTimestamp(n.updatedAt)}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Editor pane */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <StickyNoteIcon className="w-6 h-6 text-[#ddd] mx-auto mb-2.5" />
                <p className="text-sm text-[#999]">Select a note, or create a new one</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[#f0f0f0] shrink-0">
                <p className="text-[11px] text-[#999]">
                  {isMine
                    ? `Last edited ${formatTimestamp(selected.updatedAt)}`
                    : `From ${selected.authorName} · ${formatTimestamp(selected.updatedAt)}`}
                </p>
                {isMine && (
                  <div className="flex items-center gap-2 shrink-0 relative">
                    {recipientEmployees.length > 0 && (
                      <div className="flex items-center -space-x-1.5 mr-1">
                        {recipientEmployees.slice(0, 4).map((e) => {
                          const colors = getAvatarColor(e.name);
                          return (
                            <div
                              key={e.id}
                              title={e.name}
                              className={`w-6 h-6 rounded-full ${colors.bg} ${colors.text} border-2 border-white flex items-center justify-center`}
                            >
                              <span className="text-[9px] font-semibold">{getInitials(e.name)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button
                      onClick={() => setShareOpen((v) => !v)}
                      className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-xs font-medium text-[#444] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Share
                    </button>
                    <button
                      onClick={handleDelete}
                      className="p-1.5 rounded-lg text-[#999] hover:bg-[#fdeaea] hover:text-[#f31260] transition-colors"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {shareOpen && (
                      <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-[#eaeaea] rounded-xl shadow-lg z-20 p-2">
                        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest px-2 py-1.5">
                          Share with
                        </p>
                        <div className="max-h-64 overflow-y-auto space-y-0.5">
                          {employees.filter((e) => e.id !== myId).map((e) => {
                            const checked = selected.recipientIds.includes(e.id);
                            const colors = getAvatarColor(e.name);
                            return (
                              <button
                                key={e.id}
                                onClick={() => toggleRecipient(e.id)}
                                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors text-left"
                              >
                                <div className={`w-6 h-6 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}>
                                  <span className="text-[9px] font-semibold">{getInitials(e.name)}</span>
                                </div>
                                <span className="text-xs text-[#0a0a0a] flex-1 truncate">{e.name}</span>
                                {checked && <Check className="w-3.5 h-3.5 text-[#0070f3] shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {isMine ? (
                  <>
                    <input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={() => draftTitle !== selected.title && persist({ title: draftTitle })}
                      placeholder="Untitled note"
                      className="w-full text-xl font-semibold text-[#0a0a0a] placeholder:text-[#ccc] focus:outline-none mb-3"
                    />
                    <textarea
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      onBlur={() => draftBody !== selected.body && persist({ body: draftBody })}
                      placeholder="Start writing..."
                      className="w-full h-full min-h-[300px] resize-none text-sm text-[#333] placeholder:text-[#ccc] focus:outline-none leading-relaxed"
                    />
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold text-[#0a0a0a] mb-3">
                      {selected.title || "Untitled note"}
                    </h2>
                    <p className="text-sm text-[#333] whitespace-pre-wrap leading-relaxed">
                      {selected.body || "No content"}
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
