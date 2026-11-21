"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import { MessageSquare, RefreshCw, AlertCircle, Image as ImageIcon, BellOff, Send } from "lucide-react";
import { useToast } from "@/lib/toast";
import { formatPhone } from "@/lib/utils";
import type { SmsConversation, SmsMessage } from "@/lib/ringlogix-messages";

type ViewState = "loading" | "unconfigured" | "denied" | "error" | "ok";

interface PortalCustomer { id: string; company: string; phone: string }

/** "3:27 PM" today, "Nov 18" this year, "Nov 18, 2025" before that. */
function shortTime(ms: number) {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

function fullTime(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function Thread({ conversation, customer }: { conversation: SmsConversation; customer: string }) {
  const toast = useToast();
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

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
      // Shown straight away rather than waiting for RingLogix to list it:
      // a reply that takes a minute to appear is a reply people send twice.
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          at: Date.now(),
          direction: "out" as const,
          from: conversation.ourNumber,
          to: conversation.remote,
          text,
          status: "",
          mediaType: "",
        },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const params = new URLSearchParams({
          domain: conversation.domain,
          user: conversation.user,
          session: conversation.sessionId,
        });
        const res = await fetch(`/api/ringlogix/messages/thread?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? data.error ?? "Couldn't open this conversation");
        if (alive) setMessages(data.messages ?? []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't open this conversation");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [conversation.domain, conversation.user, conversation.sessionId]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-[#eaeaea] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[#0a0a0a]">
            {formatPhone(conversation.remote) || conversation.remote}
          </p>
          {customer && (
            <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10px] font-medium text-[#0070f3]">
              {customer}
            </span>
          )}
          {conversation.muted && (
            <span className="inline-flex items-center gap-1 text-[10px] text-[#999]">
              <BellOff className="w-3 h-3" /> muted
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#999] mt-0.5">
          Extension {conversation.user} · our number {formatPhone(conversation.ourNumber) || conversation.ourNumber}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {loading && (
          <div className="py-10 text-center">
            <RefreshCw className="w-5 h-5 animate-spin text-[#999] mx-auto" />
          </div>
        )}
        {error && !loading && (
          <div className="py-10 text-center">
            <AlertCircle className="w-5 h-5 text-[#f5a524] mx-auto mb-2" />
            <p className="text-xs text-[#999]">{error}</p>
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <p className="py-10 text-center text-xs text-[#999]">Nothing in this conversation.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[min(32rem,78%)]">
              <div
                className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                  m.direction === "out"
                    ? "bg-[#eff6ff] text-[#0a0a0a] rounded-br-sm"
                    : "bg-[#f5f5f5] text-[#0a0a0a] rounded-bl-sm"
                }`}
              >
                {m.text || <span className="text-[#999] italic">no text</span>}
                {m.mediaType && (
                  <span className="mt-1 flex items-center gap-1 text-[10px] text-[#666]">
                    <ImageIcon className="w-3 h-3" /> {m.mediaType}
                  </span>
                )}
              </div>
              <p className={`mt-1 text-[10px] text-[#999] ${m.direction === "out" ? "text-right" : ""}`}>
                {fullTime(m.at)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Replies go back into this conversation, to the number already on
          it - the route looks the destination up rather than trusting the
          browser, so nothing here can text a stranger. */}
      <div className="border-t border-[#eaeaea] p-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter makes a new line - what every
              // messaging app does, and what fingers expect.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Reply to ${formatPhone(conversation.remote) || conversation.remote}…`}
            className="flex-1 resize-none text-sm border border-[#eaeaea] rounded-lg px-3 py-2 max-h-32 outline-none focus:border-[#0070f3] transition-colors"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            data-tip="Send this text (Enter)"
            className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-40"
          >
            {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send
          </button>
        </div>
        <p className="text-[10px] text-[#bbb] mt-1.5">
          Goes out from extension {conversation.user || "—"} as {formatPhone(conversation.ourNumber) || conversation.ourNumber}
        </p>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [conversations, setConversations] = useState<SmsConversation[]>([]);
  const [customers, setCustomers] = useState<PortalCustomer[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/ringlogix/messages");
      if (res.status === 503) { setState("unconfigured"); return; }
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) { setError(data.message ?? "RingLogix won't let us read messages."); setState("denied"); return; }
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setConversations(data.conversations ?? []);
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/ringlogix/customers");
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setCustomers(Array.isArray(data) ? data : (data.data ?? []));
      } catch { /* a number without a name is still a number */ }
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
    (remote: string) => byNumber.get(remote.slice(-10)) ?? "",
    [byNumber],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      c.remote.includes(q.replace(/\D/g, "")) ||
      c.lastMessage.toLowerCase().includes(q) ||
      c.user.includes(q) ||
      customerFor(c.remote).toLowerCase().includes(q),
    );
  }, [conversations, search, customerFor]);

  const unread = conversations.filter((c) => c.unread).length;
  const current = conversations.find((c) => c.sessionId === selected) ?? filtered[0];

  return (
    <div>
      <Header
        title="Messages"
        subtitle="Texts to and from our numbers — the same ones that appear in Teams"
        actions={
          <button
            onClick={load}
            disabled={state === "loading"}
            data-tip="Fetch the latest conversations from RingLogix"
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
          <p className="text-sm text-[#666]">Reading every extension&apos;s conversations…</p>
          <p className="text-xs text-[#999] mt-1">Slow the first time, instant afterwards.</p>
        </div>
      )}

      {(state === "unconfigured" || state === "denied" || state === "error") && (
        <div className="bg-white border border-[#eaeaea] rounded-xl p-12 text-center">
          <AlertCircle className={`w-6 h-6 mx-auto mb-3 ${state === "error" ? "text-[#f31260]" : "text-[#f5a524]"}`} />
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">
            {state === "unconfigured" ? "RingLogix isn't configured"
              : state === "denied" ? "RingLogix won't let us read this"
              : "Failed to load"}
          </p>
          <p className="text-xs text-[#999] max-w-md mx-auto">{error}</p>
          {state === "error" && (
            <button onClick={load} className="mt-3 text-xs text-[#0070f3] hover:underline">Retry</button>
          )}
        </div>
      )}

      {state === "ok" && (
        <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[22rem_1fr] h-[calc(100vh-15rem)] min-h-125">
            {/* The list */}
            <div className="border-b md:border-b-0 md:border-r border-[#eaeaea] flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-[#eaeaea]">
                <input
                  type="text"
                  placeholder="Search a number, a name, a word…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors"
                />
                <p className="text-[11px] text-[#999] mt-2">
                  {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
                  {unread > 0 && <span className="text-[#0070f3] font-medium"> · {unread} unread</span>}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="p-8 text-center text-xs text-[#999]">
                    {conversations.length === 0 ? "No texts yet." : "Nothing matches that."}
                  </p>
                )}
                {filtered.map((c) => {
                  const active = current?.sessionId === c.sessionId;
                  const company = customerFor(c.remote);
                  return (
                    <button
                      key={c.sessionId}
                      onClick={() => setSelected(c.sessionId)}
                      className={`w-full text-left px-4 py-3 border-b border-[#f7f7f7] transition-colors ${
                        active ? "bg-[#eff6ff]" : "hover:bg-[#fafafa]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate ${c.unread ? "font-semibold text-[#0a0a0a]" : "text-[#444]"}`}>
                          {company || formatPhone(c.remote) || c.remote}
                        </p>
                        <span className="text-[10px] text-[#999] shrink-0">{shortTime(c.lastAt)}</span>
                      </div>
                      {company && (
                        <p className="text-[10px] text-[#999] font-mono">{formatPhone(c.remote) || c.remote}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {c.unread && <span className="w-1.5 h-1.5 rounded-full bg-[#0070f3] shrink-0" />}
                        <p className="text-xs text-[#999] truncate">
                          {c.theirTurn ? "" : "You: "}{c.lastMessage.replace(/\s+/g, " ") || "(media)"}
                        </p>
                      </div>
                      <p className="text-[10px] text-[#bbb] mt-0.5">ext {c.user}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* The conversation */}
            <div className="min-h-0">
              {current ? (
                <Thread
                  key={current.sessionId}
                  conversation={current}
                  customer={customerFor(current.remote)}
                />
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
