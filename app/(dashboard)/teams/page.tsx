"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import { MessageSquare, RefreshCw, AlertCircle, Users, Bot, ExternalLink, Paperclip } from "lucide-react";

interface TeamsChat {
  id: string;
  title: string;
  kind: string;
  webUrl: string;
  lastMessage: string;
  lastFrom: string;
  lastAt: string;
  members: string[];
}

interface TeamsMessage {
  id: string;
  at: string;
  from: string;
  fromApp: boolean;
  authorId: string;
  text: string;
  attachments: string[];
}

type ViewState = "loading" | "disconnected" | "error" | "ok";

function shortTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

function fullTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function Thread({ chat, meId }: { chat: TeamsChat; meId: string }) {
  const [messages, setMessages] = useState<TeamsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch(`/api/teams/chats/${encodeURIComponent(chat.id)}/messages`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't open this conversation");
        if (!alive) return;
        if (data.connected === false) setError(data.reason ?? "Not connected to Microsoft.");
        else setMessages(data.messages ?? []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't open this conversation");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [chat.id]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-[#eaeaea] px-5 py-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0a0a0a] truncate">{chat.title}</p>
          <p className="text-[11px] text-[#999] mt-0.5">
            {chat.kind === "oneOnOne" ? "Direct message" : chat.kind === "group" ? `Group · ${chat.members.length} people` : chat.kind || "Chat"}
          </p>
        </div>
        {chat.webUrl && (
          <a
            href={chat.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-tip="Open this conversation in Teams"
            className="shrink-0 inline-flex items-center gap-1.5 text-[11px] text-[#0070f3] hover:underline"
          >
            Open in Teams <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {loading && (
          <div className="py-10 text-center"><RefreshCw className="w-5 h-5 animate-spin text-[#999] mx-auto" /></div>
        )}
        {error && !loading && (
          <div className="py-10 text-center">
            <AlertCircle className="w-5 h-5 text-[#f5a524] mx-auto mb-2" />
            <p className="text-xs text-[#999]">{error}</p>
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <p className="py-10 text-center text-xs text-[#999]">Nothing to show in this conversation.</p>
        )}
        {messages.map((m) => {
          const mine = Boolean(meId) && m.authorId === meId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[min(34rem,80%)]">
                {!mine && m.from && (
                  <p className="text-[10px] text-[#999] mb-0.5 flex items-center gap-1">
                    {m.fromApp && <Bot className="w-3 h-3" />}
                    {m.from}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                    mine ? "bg-[#eff6ff] text-[#0a0a0a] rounded-br-sm" : "bg-[#f5f5f5] text-[#0a0a0a] rounded-bl-sm"
                  }`}
                >
                  {m.text || <span className="text-[#999] italic">no text</span>}
                  {m.attachments.length > 0 && (
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-[#666]">
                      <Paperclip className="w-3 h-3" /> {m.attachments.join(", ")}
                    </span>
                  )}
                </div>
                <p className={`mt-1 text-[10px] text-[#999] ${mine ? "text-right" : ""}`}>{fullTime(m.at)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [chats, setChats] = useState<TeamsChat[]>([]);
  const [meId, setMeId] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/teams/chats");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      if (data.connected === false) {
        setReason(data.reason ?? "Sign in with Microsoft to see your Teams messages.");
        setState("disconnected");
        return;
      }
      setChats(data.chats ?? []);
      setState("ok");
    } catch (e) {
      setReason(e instanceof Error ? e.message : "Failed to load");
      setState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The thread endpoint reports who "me" is, so our own messages can sit on
  // the right. Taken from the first thread opened rather than a call of its
  // own.
  useEffect(() => {
    if (!selected || meId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/teams/chats/${encodeURIComponent(selected)}/messages?top=1`);
        const data = await res.json();
        if (alive && data.meId) setMeId(data.meId);
      } catch { /* bubbles just stay left-aligned */ }
    })();
    return () => { alive = false; };
  }, [selected, meId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      c.lastMessage.toLowerCase().includes(q) ||
      c.members.some((m) => m.toLowerCase().includes(q)),
    );
  }, [chats, search]);

  const current = chats.find((c) => c.id === selected) ?? filtered[0];

  return (
    <div>
      <Header
        title="Teams"
        subtitle="Your Teams conversations, as you see them in Teams"
        actions={
          <button
            onClick={load}
            disabled={state === "loading"}
            data-tip="Fetch your latest Teams conversations"
            className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${state === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {state === "loading" && (
        <div className="bg-white border border-[#eaeaea] rounded-xl p-12 text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
          <p className="text-sm text-[#666]">Reading your conversations…</p>
        </div>
      )}

      {(state === "disconnected" || state === "error") && (
        <div className="bg-white border border-[#eaeaea] rounded-xl p-12 text-center">
          <AlertCircle className={`w-6 h-6 mx-auto mb-3 ${state === "error" ? "text-[#f31260]" : "text-[#f5a524]"}`} />
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">
            {state === "disconnected" ? "Not connected to Microsoft" : "Couldn't load your Teams messages"}
          </p>
          <p className="text-xs text-[#999] max-w-md mx-auto">{reason}</p>
          {state === "disconnected" && (
            <p className="text-xs text-[#999] mt-3">
              Sign out and sign back in with Microsoft — this reads with the account you already use here.
            </p>
          )}
        </div>
      )}

      {state === "ok" && (
        <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[22rem_1fr] h-[calc(100vh-15rem)] min-h-125">
            <div className="border-b md:border-b-0 md:border-r border-[#eaeaea] flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-[#eaeaea]">
                <input
                  type="text"
                  placeholder="Search a person, a group, a word…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors"
                />
                <p className="text-[11px] text-[#999] mt-2">
                  {chats.length} conversation{chats.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="p-8 text-center text-xs text-[#999]">
                    {chats.length === 0 ? "No conversations." : "Nothing matches that."}
                  </p>
                )}
                {filtered.map((c) => {
                  const active = current?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelected(c.id)}
                      className={`w-full text-left px-4 py-3 border-b border-[#f7f7f7] transition-colors ${
                        active ? "bg-[#eff6ff]" : "hover:bg-[#fafafa]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-[#0a0a0a] truncate flex items-center gap-1.5">
                          {c.kind !== "oneOnOne" && <Users className="w-3 h-3 text-[#999] shrink-0" />}
                          {c.title}
                        </p>
                        <span className="text-[10px] text-[#999] shrink-0">{shortTime(c.lastAt)}</span>
                      </div>
                      <p className="text-xs text-[#999] truncate mt-0.5">
                        {c.lastFrom ? `${c.lastFrom}: ` : ""}{c.lastMessage || "—"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0">
              {current ? (
                <Thread key={current.id} chat={current} meId={meId} />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="w-6 h-6 text-[#ccc] mx-auto mb-2" />
                    <p className="text-xs text-[#999]">Pick a conversation.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
