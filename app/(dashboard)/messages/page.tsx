"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare, RefreshCw, AlertCircle, BellOff,
  Send, Check, MailOpen, Mail, PanelRight, Search, Tag as TagIcon, Paperclip,
} from "lucide-react";
import { formatPhone } from "@/lib/utils";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import {
  listThreadAnnotations, saveThreadAnnotation, type ThreadAnnotation,
} from "@/lib/db/message-threads";
import { MESSAGE_TAGS, knownTags } from "@/lib/message-tags";
import Avatar from "@/components/messages/Avatar";
import type { SmsConversation, SmsMessage } from "@/lib/ringlogix-messages";

type ViewState = "loading" | "unconfigured" | "denied" | "error" | "ok";
type Filter = "all" | "unread" | "tagged";

interface PortalCustomer { id: string; company: string; phone: string }

/** "3:27 PM" today, "Nov 18" this year, "Nov 18, 2025" before that. */
function shortTime(ms: number) {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

function fullTime(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/**
 * Turns the URLs in a message into links.
 *
 * Customers send tracking links, portal links, addresses. Rendering them
 * as dead text means copying by hand out of a bubble - and these are
 * plain strings from strangers, so they are matched and rebuilt rather
 * than interpreted: no markup from a text ever reaches the page.
 */
function withLinks(text: string, mine: boolean) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi);
  return parts.map((part, i) => {
    if (!/^(https?:\/\/|www\.)/i.test(part)) return part;
    const href = part.startsWith("www.") ? `https://${part}` : part;
    return (
      <a
        key={i}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={`underline underline-offset-2 ${mine ? "text-white/90 hover:text-white" : "text-[#0070f3]"}`}
      >
        {part}
      </a>
    );
  });
}

/** "22 KB", "1.4 MB" - a size nobody has to divide in their head. */
function fileSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A colleague by name, a customer by company, anyone else by number. */
function partyName(c: SmsConversation, names: Record<string, string>, customer: string): string {
  if (c.remoteExtension) {
    const known = names[c.remoteExtension];
    if (known) return known;
    // Some of our own users are numbers - the DIDs are in the subscriber
    // list - so an unnamed internal party still reads as a phone number
    // rather than as "Extension 18054833939".
    return /^\d{10,}$/.test(c.remoteExtension)
      ? formatPhone(c.remoteExtension) || c.remoteExtension
      : `Extension ${c.remoteExtension}`;
  }
  return customer || formatPhone(c.remote) || c.remote || "Unknown";
}

// ── The conversation ────────────────────────────────────────────────────

function Thread({
  conversation, customer, names, meExtension, onSent,
}: {
  conversation: SmsConversation;
  customer: string;
  names: Record<string, string>;
  meExtension: string;
  onSent: () => void;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Messages sent from here that RingLogix hasn't listed back yet. Kept
  // apart from the server's own, or a poll two seconds after sending
  // would make the reply vanish and reappear.
  const pending = useRef<SmsMessage[]>([]);

  useEffect(() => {
    let alive = true;
    pending.current = [];
    setLoading(true);
    setError("");

    const read = async (silent: boolean, attempt = 0) => {
      try {
        const params = new URLSearchParams({
          domain: conversation.domain,
          user: conversation.user,
          session: conversation.sessionId,
        });
        const res = await fetch(`/api/ringlogix/messages/thread?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? data.error ?? "Couldn't open this conversation");
        if (!alive) return;
        const server: SmsMessage[] = data.messages ?? [];
        // A reply we are still waiting to see listed stays on screen until
        // the server's copy of it turns up, matched on its text.
        pending.current = pending.current.filter(
          (p) => !server.some((m) => m.direction === "out" && m.text === p.text),
        );
        setMessages([...server, ...pending.current].sort((a, b) => a.at - b.at));
        setError("");
      } catch (e) {
        // A failed poll is not worth replacing a readable conversation
        // with an error; only the first read gets to do that - and even
        // then it asks twice. RingLogix hands back the occasional 500
        // with an activity id and no explanation, and it passes.
        if (!alive || silent) return;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 800));
          if (alive) await read(false, 1);
          return;
        }
        setError(e instanceof Error ? e.message : "Couldn't open this conversation");
      } finally {
        if (alive && !silent) setLoading(false);
      }
    };

    read(false);

    // New texts arrive whenever the customer sends them, so the open
    // conversation asks again every few seconds - but only while the tab
    // is actually being looked at.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") read(true);
    }, 8000);
    return () => { alive = false; clearInterval(timer); };
  }, [conversation.domain, conversation.user, conversation.sessionId]);

  // A conversation opens at its newest message, and follows along while
  // you are at the bottom - but never yanks you away from something you
  // have scrolled up to read.
  const count = messages.length;
  const wasAtBottom = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (loading) return;
    if (wasAtBottom.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [loading, count]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/ringlogix/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: conversation.sessionId,
          user: conversation.user,
          domain: conversation.domain,
          text,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Couldn't send that");
      setDraft("");
      wasAtBottom.current = true;
      // Shown straight away rather than waiting for RingLogix to list it:
      // a reply that takes a minute to appear is a reply people send twice.
      const echo: SmsMessage = {
          id: `local-${Date.now()}`,
          at: Date.now(),
          direction: "out" as const,
          fromExtension: conversation.user,
          fromName: names[conversation.user] ?? "",
          from: conversation.ourNumber,
          to: conversation.remote,
        text,
        status: "",
        mediaType: "",
        mediaSize: 0,
        hasMedia: false,
      };
      pending.current = [...pending.current, echo];
      setMessages((prev) => [...prev, echo]);
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that");
    } finally {
      setSending(false);
    }
  }

  const them = partyName(conversation, names, customer);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="flex-1 overflow-y-auto px-5 py-5 space-y-4 min-h-0"
      >
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
          <p className="py-10 text-center text-xs text-[#999]">Nothing in this conversation yet.</p>
        )}

        {messages.map((m) => {
          const mine = m.direction === "out";
          const who = m.fromName
            ? (m.fromExtension && m.fromExtension === meExtension ? `${m.fromName} (you)` : m.fromName)
            : them;
          return (
            <div key={m.id} className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
              <Avatar name={who} tone={mine ? "dark" : "light"} />
              <div className={`max-w-[min(34rem,78%)] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    mine
                      ? "bg-[#0070f3] text-white rounded-br-sm"
                      : "bg-[#f5f5f5] text-[#0a0a0a] rounded-bl-sm"
                  }`}
                >
                  {m.hasMedia && (() => {
                    const src = `/api/ringlogix/messages/media?${new URLSearchParams({
                      domain: conversation.domain,
                      user: conversation.user,
                      session: conversation.sessionId,
                      id: m.id,
                    })}`;
                    const isImage = m.mediaType.startsWith("image/");
                    return isImage ? (
                      <a href={src} target="_blank" rel="noopener noreferrer" className="block mb-1.5">
                        {/* Not next/image: the bytes come through our own
                            proxy and their dimensions are unknown here. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={m.text || "Attachment"}
                          loading="lazy"
                          className="rounded-lg max-h-72 w-auto bg-[#f5f5f5]"
                        />
                      </a>
                    ) : (
                      <a
                        href={src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`mb-1.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs ${
                          mine ? "bg-white/15 hover:bg-white/25" : "bg-white hover:bg-[#f0f0f0] border border-[#eaeaea]"
                        } transition-colors`}
                      >
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {m.mediaType || "Attachment"}
                          {m.mediaSize ? ` · ${fileSize(m.mediaSize)}` : ""}
                        </span>
                      </a>
                    );
                  })()}
                  {m.text
                    ? withLinks(m.text, mine)
                    : !m.hasMedia && <span className="opacity-60 italic">no text</span>}
                </div>
                <p className="mt-1 text-[10px] text-[#999]">{fullTime(m.at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {/* Replies go back into this conversation, to the number already on
          it - the route looks the destination up rather than trusting the
          browser, so nothing here can text a stranger. */}
      <div className="border-t border-[#eaeaea] p-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter makes a new line - what every
              // messaging app does, and what fingers expect.
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder={`Reply to ${them}…`}
            className="flex-1 resize-none text-sm bg-[#fafafa] border border-[#eaeaea] rounded-xl px-3.5 py-2.5 max-h-32 outline-none focus:border-[#0a0a0a] focus:bg-white transition-colors"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            data-tip="Send (Enter)"
            className="flex items-center justify-center w-10 h-10 bg-[#0070f3] text-white rounded-xl hover:bg-[#0060df] transition-colors disabled:opacity-30"
          >
            {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-[#bbb] mt-1.5 px-0.5">
          From extension {conversation.user || "—"}
          {conversation.ourNumber ? ` · ${formatPhone(conversation.ourNumber) || conversation.ourNumber}` : ""}
        </p>
      </div>
    </div>
  );
}

// ── Notes and tags: the part RingLogix has nowhere to put ───────────────

function Details({
  conversation, annotation, onSave,
}: {
  conversation: SmsConversation;
  annotation: ThreadAnnotation | undefined;
  onSave: (patch: { notes?: string; tags?: string[] }) => Promise<boolean>;
}) {
  // null means "nothing typed yet, show what is stored". Holding the
  // stored value in state instead would snapshot it at mount - and the
  // annotations arrive a moment after the conversation does, so a note
  // somebody had already written rendered as an empty box. Deriving it
  // also keeps this clear of setting state from an effect, which the
  // React Compiler rules reject outright.
  const [typed, setTyped] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const stored = annotation?.notes ?? "";
  const notes = typed ?? stored;
  const tags = annotation?.tags ?? [];

  async function commitNotes() {
    if (typed === null || typed === stored) return;
    setStatus("saving");
    const ok = await onSave({ notes: typed });
    setStatus(ok ? "saved" : "idle");
    // Back to showing what is stored, which is now what was typed.
    if (ok) setTyped(null);
  }

  async function toggleTag(key: string) {
    await onSave({ tags: tags.includes(key) ? tags.filter((t) => t !== key) : [...tags, key] });
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto p-5 space-y-6">
      <div>
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-2.5">Tags</p>
        <div className="flex flex-wrap gap-1.5">
          {MESSAGE_TAGS.map((t) => {
            const on = tags.includes(t.key);
            return (
              <button
                key={t.key}
                onClick={() => toggleTag(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  on ? t.className : "bg-white text-[#999] border border-[#eaeaea] hover:border-[#d4d4d4]"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${on ? t.dot : "bg-[#d4d4d4]"}`} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest">Notes</p>
          {status === "saving" && <span className="text-[10px] text-[#999]">saving…</span>}
          {status === "saved" && (
            <span className="text-[10px] text-[#15803d] flex items-center gap-1"><Check className="w-3 h-3" /> saved</span>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => { setTyped(e.target.value); setStatus("idle"); }}
          onBlur={commitNotes}
          rows={8}
          placeholder="What this is about, what was promised, who is handling it…"
          className="w-full resize-none text-sm bg-[#fafafa] border border-[#eaeaea] rounded-xl px-3 py-2.5 outline-none focus:border-[#0a0a0a] focus:bg-white transition-colors"
        />
        <p className="text-[10px] text-[#bbb] mt-1.5">Saved when you click away. Everyone here sees it.</p>
      </div>

      <div className="border-t border-[#f5f5f5] pt-4 space-y-1">
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-2">Conversation</p>
        <p className="text-[11px] text-[#666]">Extension {conversation.user || "—"}</p>
        {conversation.ourNumber && (
          <p className="text-[11px] text-[#666]">
            Our number {formatPhone(conversation.ourNumber) || conversation.ourNumber}
          </p>
        )}
        {annotation?.updatedBy && (
          <p className="text-[11px] text-[#bbb] pt-1">Last noted by {annotation.updatedBy}</p>
        )}
      </div>
    </div>
  );
}

// ── The page ────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { authUser } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<ViewState>("loading");
  const [conversations, setConversations] = useState<SmsConversation[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [customers, setCustomers] = useState<PortalCustomer[]>([]);
  const [annotations, setAnnotations] = useState<Record<string, ThreadAnnotation>>({});
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showDetails, setShowDetails] = useState(true);
  // Below lg there is no room for a third column, so the details take
  // over the conversation pane instead - with its own state, or opening
  // the rail on a desktop would hide the thread on a phone.
  const [mobileDetails, setMobileDetails] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setState("loading");
    try {
      const res = await fetch("/api/ringlogix/messages");
      if (res.status === 503) { setState("unconfigured"); return; }
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setError(data.message ?? "RingLogix won't let us read messages.");
          setState("denied");
          return;
        }
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setConversations(data.conversations ?? []);
      setNames(data.names ?? {});
      setState("ok");
    } catch (e) {
      if (silent) return;
      setError(e instanceof Error ? e.message : "Failed to load");
      setState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A text can arrive in any conversation, not just the open one, so the
  // list refreshes itself as well - silently, so it never flashes a
  // spinner over something being read, and never while the tab is hidden.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, 12000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [list, notes] = await Promise.all([
        fetch("/api/ringlogix/customers").then((r) => (r.ok ? r.json() : [])).catch(() => []),
        listThreadAnnotations().catch(() => ({})),
      ]);
      if (!alive) return;
      setCustomers(Array.isArray(list) ? list : (list.data ?? []));
      setAnnotations(notes);
    })();
    return () => { alive = false; };
  }, []);

  // Whoever is texting us may already be a customer. Matched on the digits
  // of the number on file, so formatting differences don't hide a match.
  const byNumber = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) {
      const digits = (c.phone ?? "").replace(/\D/g, "").slice(-10);
      if (digits.length === 10) map.set(digits, c.company);
    }
    return map;
  }, [customers]);

  const customerFor = useCallback(
    (remote: string) => (remote ? byNumber.get(remote.slice(-10)) ?? "" : ""),
    [byNumber],
  );

  // Which extension is the viewer? The ERP knows their name and RingLogix
  // knows the extensions; the name is what both agree on. Only used to add
  // "(you)" to a label, so a miss costs nothing.
  const meExtension = useMemo(() => {
    const mine = (authUser?.displayName ?? "").trim().toLowerCase();
    if (!mine) return "";
    return Object.entries(names).find(([, n]) => n.trim().toLowerCase() === mine)?.[0] ?? "";
  }, [names, authUser?.displayName]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "unread" && !c.unread) return false;
      if (filter === "tagged" && !annotations[c.sessionId]?.tags?.length) return false;
      if (!q) return true;
      const name = partyName(c, names, customerFor(c.remote)).toLowerCase();
      return (
        name.includes(q) ||
        c.remote.includes(q.replace(/\D/g, "")) ||
        c.lastMessage.toLowerCase().includes(q) ||
        (annotations[c.sessionId]?.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversations, search, filter, names, customerFor, annotations]);

  const current = conversations.find((c) => c.sessionId === selected) ?? filtered[0];
  const unreadCount = conversations.filter((c) => c.unread).length;
  const taggedCount = conversations.filter((c) => annotations[c.sessionId]?.tags?.length).length;

  async function setRead(c: SmsConversation, read: boolean) {
    // Optimistic: the round trip to the PBX takes a second or two, and a
    // click that appears to do nothing gets clicked again.
    setConversations((prev) => prev.map((x) => (x.sessionId === c.sessionId ? { ...x, unread: !read } : x)));
    try {
      const res = await fetch("/api/ringlogix/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: c.sessionId, user: c.user, domain: c.domain, read }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't change that");
    } catch (e) {
      setConversations((prev) => prev.map((x) => (x.sessionId === c.sessionId ? { ...x, unread: c.unread } : x)));
      toast.error(e instanceof Error ? e.message : "Couldn't change that");
    }
  }

  async function saveAnnotation(
    c: SmsConversation,
    patch: { notes?: string; tags?: string[] },
  ): Promise<boolean> {
    const saved = await saveThreadAnnotation(
      c.sessionId,
      { ...patch, domain: c.domain },
      authUser?.displayName || authUser?.email || "",
    );
    if (!saved) {
      toast.error("Couldn't save that — supabase/migration-message-threads.sql may not have been run yet.");
      return false;
    }
    setAnnotations((prev) => ({ ...prev, [c.sessionId]: saved }));
    return true;
  }

  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "All", n: conversations.length },
    { key: "unread", label: "Unread", n: unreadCount },
    { key: "tagged", label: "Tagged", n: taggedCount },
  ];

  return (
    // Exactly the viewport, so the page itself never scrolls: the shell is
    // 100vh with a 3.5rem bar and 2rem of padding top and bottom.
    <div className="flex flex-col md:h-[calc(100vh-7.5rem)] min-h-0">
      <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-[#0a0a0a]">Messages</h1>
          <p className="text-sm text-[#666] mt-0.5">
            Texts to and from our numbers — the same ones that appear in Teams
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowDetails((v) => !v)}
            data-tip={showDetails ? "Hide notes and tags" : "Show notes and tags"}
            className={`hidden lg:flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${
              showDetails
                ? "border-[#0a0a0a] bg-[#0a0a0a] text-white"
                : "border-[#eaeaea] bg-white text-[#444] hover:bg-[#fafafa]"
            }`}
          >
            <PanelRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => load()}
            disabled={state === "loading"}
            data-tip="Fetch the latest conversations"
            className="flex items-center gap-2 border border-[#eaeaea] bg-white text-sm font-medium text-[#0a0a0a] px-3.5 h-9 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${state === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {state === "loading" && (
        <div className="bg-white border border-[#eaeaea] rounded-xl p-12 text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-[#999] mx-auto mb-3" />
          <p className="text-sm text-[#666]">Reading your conversations…</p>
        </div>
      )}

      {(state === "unconfigured" || state === "denied" || state === "error") && (
        <div className="bg-white border border-[#eaeaea] rounded-xl p-12 text-center">
          <AlertCircle className={`w-6 h-6 mx-auto mb-3 ${state === "error" ? "text-[#f31260]" : "text-[#f5a524]"}`} />
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">
            {state === "unconfigured" ? "RingLogix isn't configured"
              : state === "denied" ? "RingLogix won't let us read this"
              : "Couldn't load your messages"}
          </p>
          <p className="text-xs text-[#999] max-w-md mx-auto">{error}</p>
          {state === "error" && (
            <button onClick={() => load()} className="mt-3 text-xs text-[#0070f3] hover:underline">Retry</button>
          )}
        </div>
      )}

      {state === "ok" && (
        <div className="flex-1 min-h-0 bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
          <div
            className={`grid h-full min-h-0 grid-cols-1 md:grid-cols-[20rem_1fr] ${
              showDetails && current ? "lg:grid-cols-[20rem_1fr_18rem]" : ""
            }`}
          >
            {/* ── The list ── */}
            <aside className="border-b md:border-b-0 md:border-r border-[#eaeaea] flex flex-col min-h-0">
              <div className="p-3 border-b border-[#eaeaea] space-y-2.5 shrink-0">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#999] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full text-sm bg-[#fafafa] border border-[#eaeaea] rounded-lg pl-9 pr-3 py-1.5 outline-none focus:border-[#0a0a0a] focus:bg-white transition-colors"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        filter === f.key ? "bg-[#f0f0f0] text-[#0a0a0a]" : "text-[#999] hover:text-[#444]"
                      }`}
                    >
                      {f.label} <span className="opacity-60">{f.n}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {filtered.length === 0 && (
                  <p className="p-8 text-center text-xs text-[#999]">
                    {conversations.length === 0 ? "No texts yet." : "Nothing matches that."}
                  </p>
                )}
                {filtered.map((c) => {
                  const active = current?.sessionId === c.sessionId;
                  const name = partyName(c, names, customerFor(c.remote));
                  const tags = knownTags(annotations[c.sessionId]?.tags);
                  return (
                    <button
                      key={c.sessionId}
                      onClick={() => setSelected(c.sessionId)}
                      className={`w-full text-left px-3 py-2.5 border-b border-[#f5f5f5] flex gap-2.5 transition-colors ${
                        active ? "bg-[#fafafa]" : "hover:bg-[#fafafa]"
                      }`}
                    >
                      <Avatar name={name} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`text-sm truncate ${c.unread ? "font-semibold text-[#0a0a0a]" : "text-[#444]"}`}>
                            {name}
                          </span>
                          <span className="text-[10px] text-[#bbb] shrink-0">{shortTime(c.lastAt)}</span>
                        </span>
                        <span className="flex items-center gap-1.5 mt-0.5">
                          {c.unread && <span className="w-1.5 h-1.5 rounded-full bg-[#0070f3] shrink-0" />}
                          <span className="text-xs text-[#999] truncate">
                            {c.theirTurn ? "" : "You: "}
                            {c.lastMessage.replace(/\s+/g, " ") || "(media)"}
                          </span>
                        </span>
                        {tags.length > 0 && (
                          <span className="flex flex-wrap items-center gap-1 mt-1">
                            {tags.map((t) => (
                              <span key={t.key} className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${t.className}`}>
                                {t.label}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* ── The conversation ── */}
            <section className="flex flex-col min-h-0 min-w-0">
              {current ? (
                <>
                  <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#eaeaea] shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={partyName(current, names, customerFor(current.remote))} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0a0a0a] truncate">
                          {partyName(current, names, customerFor(current.remote))}
                        </p>
                        <p className="text-[11px] text-[#999] truncate flex items-center gap-2">
                          {current.remote
                            ? formatPhone(current.remote) || current.remote
                            : `Extension ${current.remoteExtension}`}
                          {current.muted && (
                            <span className="inline-flex items-center gap-1"><BellOff className="w-3 h-3" /> muted</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setRead(current, current.unread)}
                        data-tip={current.unread ? "Mark read, here and in Teams" : "Mark unread, here and in Teams"}
                        className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[11px] font-medium text-[#444] px-2.5 h-8 rounded-lg hover:bg-[#fafafa] transition-colors"
                      >
                        {current.unread ? <MailOpen className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                        {current.unread ? "Mark read" : "Mark unread"}
                      </button>
                      <button
                        onClick={() => setMobileDetails((v) => !v)}
                        data-tip={mobileDetails ? "Back to the conversation" : "Notes and tags"}
                        className={`lg:hidden flex items-center justify-center w-8 h-8 border rounded-lg transition-colors ${
                          mobileDetails
                            ? "border-[#0a0a0a] bg-[#0a0a0a] text-white"
                            : "border-[#eaeaea] bg-white text-[#444] hover:bg-[#fafafa]"
                        }`}
                      >
                        <TagIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </header>

                  {mobileDetails ? (
                    <div className="lg:hidden flex-1 min-h-0">
                      <Details
                        key={`m-${current.sessionId}`}
                        conversation={current}
                        annotation={annotations[current.sessionId]}
                        onSave={(patch) => saveAnnotation(current, patch)}
                      />
                    </div>
                  ) : null}
                  <div className={mobileDetails ? "hidden lg:flex lg:flex-col flex-1 min-h-0" : "flex flex-col flex-1 min-h-0"}>
                    <Thread
                      key={current.sessionId}
                      conversation={current}
                      customer={customerFor(current.remote)}
                      names={names}
                      meExtension={meExtension}
                      onSent={() => load(true)}
                    />
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="w-6 h-6 text-[#ccc] mx-auto mb-2" />
                    <p className="text-xs text-[#999]">Pick a conversation.</p>
                  </div>
                </div>
              )}
            </section>

            {/* ── Notes and tags ── */}
            {showDetails && current && (
              <aside className="hidden lg:block border-l border-[#eaeaea] min-h-0">
                <Details
                  key={current.sessionId}
                  conversation={current}
                  annotation={annotations[current.sessionId]}
                  onSave={(patch) => saveAnnotation(current, patch)}
                />
              </aside>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
