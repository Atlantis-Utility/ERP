"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare, RefreshCw, AlertCircle, BellOff,
  Send, Check, MailOpen, Mail, PanelRight, Search, Tag as TagIcon, Paperclip,
  Inbox, Phone, UserPlus, ExternalLink, ChevronLeft, PenSquare, X, Pencil, Trash2,
} from "lucide-react";
import { formatPhone } from "@/lib/utils";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
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
function withLinks(text: string) {
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
        className="underline underline-offset-2 text-[#0070f3] hover:text-[#0060df]"
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
function partyName(
  c: SmsConversation,
  names: Record<string, string>,
  customer: string,
  contacts?: Record<string, { name: string; company: string }>,
): string {
  // Somebody took the trouble to name this one; nothing we can work out
  // beats that.
  if (c.name) return c.name;
  // A group is who is in it, not the first of them.
  if (c.isGroup && c.remoteNumbers.length > 1) {
    const each = c.remoteNumbers.map(
      (n) => contacts?.[n.slice(-10)]?.name || formatPhone(n) || n,
    );
    if (each.length <= 2) return each.join(" & ");
    return `${each.slice(0, 2).join(", ")} +${each.length - 2}`;
  }
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
  conversation, customer, names, meExtension, meName, onSent,
}: {
  conversation: SmsConversation;
  customer: string;
  names: Record<string, string>;
  meExtension: string;
  /** The signed-in person's own name, for saying "(you)". */
  meName: string;
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
          // Us, not the extension's owner: four people share this number
          // and the one who pressed send is the one reading this.
          fromName: meName || names[conversation.user] || "",
          sentFromErp: true,
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
          // Ours either because the ERP recorded us as the sender, or
          // because the message came from our own extension.
          const isMe =
            (m.sentFromErp && meName && m.fromName === meName) ||
            Boolean(m.fromExtension && meExtension && m.fromExtension === meExtension);
          const who = m.fromName ? (isMe ? `${m.fromName} (you)` : m.fromName) : them;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              {/* The circle sits on the bubble's bottom edge, the way a
                  chat reads, and the time sits under the bubble rather
                  than under the circle - both were floating before. */}
              <div className={`flex items-end gap-2 max-w-full ${mine ? "flex-row-reverse" : ""}`}>
                {/* Everyone keeps their own colour on both sides of the
                    thread; which side it sits on is what says whose it is. */}
                <Avatar name={who} />
                <div className="max-w-[min(34rem,calc(100%-2.5rem))] min-w-0">
                <div
                  // Ours tinted, theirs neutral, both with the text dark
                  // enough to read for a long time. A solid accent bubble
                  // looks striking in a screenshot and tiring in a thread.
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    mine
                      ? "bg-[#eff6ff] text-[#0a0a0a] rounded-br-sm"
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
                        className="mb-1.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs bg-white hover:bg-[#fafafa] border border-[#eaeaea] transition-colors"
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
                    ? withLinks(m.text)
                    : !m.hasMedia && <span className="opacity-60 italic">no text</span>}
                </div>
                </div>
              </div>
              <p className={`mt-1 text-[10px] text-[#999] ${mine ? "mr-10" : "ml-10"}`}>
                {fullTime(m.at)}
              </p>
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

/**
 * Puts a name to a number, in RingLogix's own contact book.
 *
 * Not in ours: a contact saved here is the one the phone system uses, so
 * the name shows up for everybody and in Teams as well, rather than being
 * a label that only exists on this page.
 */
function SaveContact({
  conversation, suggested, onSaved,
}: {
  conversation: SmsConversation;
  suggested: string;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [company, setCompany] = useState(suggested);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!first.trim() && !last.trim()) {
      toast.error("A contact needs a name.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ringlogix/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: conversation.domain,
          // Saved on the extension that holds the conversation, which is
          // the one that will be looking at it again.
          user: conversation.user,
          first_name: first.trim(),
          last_name: last.trim(),
          company: company.trim(),
          cell_phone: conversation.remote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Couldn't save that contact");
      setOpen(false);
      setFirst(""); setLast("");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that contact");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#d4d4d4] py-1.5 text-[11px] font-medium text-[#666] hover:border-[#0070f3] hover:text-[#0070f3] transition-colors"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Save as contact
      </button>
    );
  }

  const field = "w-full text-sm bg-[#fafafa] border border-[#eaeaea] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0a0a0a] focus:bg-white transition-colors";
  return (
    <div className="space-y-2 rounded-lg border border-[#eaeaea] p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <input className={field} placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} autoFocus />
        <input className={field} placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} />
      </div>
      <input className={field} placeholder="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} />
      <p className="text-[10px] text-[#bbb]">
        Saved to the phone system against {formatPhone(conversation.remote) || conversation.remote}.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-[#0a0a0a] text-white text-[11px] font-medium rounded-lg py-1.5 hover:bg-[#333] transition-colors disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save contact"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-[11px] text-[#999] hover:text-[#444] px-2 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Texting somebody who has never texted us.
 *
 * Deliberately not part of the reply box. A reply takes its destination
 * from the conversation and cannot reach anybody new; this takes a number
 * a person typed, which is the one way a text from here reaches a
 * stranger. Hence the confirmation, and a server that checks the digits
 * and the sending number rather than trusting either.
 */
function NewMessage({
  senders, domain, suggestions, onClose, onSent,
}: {
  senders: Array<{ number: string; user: string }>;
  domain: string;
  /** Numbers we already know: from conversations and the contact book. */
  suggestions: Array<{ number: string; label: string; from: string; kind?: "number" | "extension" }>;
  onClose: () => void;
  onSent: (sessionId: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [to, setTo] = useState("");
  const [from, setFrom] = useState(senders[0]?.number ?? "");
  const [text, setText] = useState("");
  const [groupName, setGroupName] = useState("");
  const [sending, setSending] = useState(false);

  // One number, or several separated by commas - which makes it a group.
  const parsed = to
    .split(/[,;]+/)
    .map((x) => x.replace(/\D/g, ""))
    .filter(Boolean)
    .map((x) => (x.length === 11 && x.startsWith("1") ? x.slice(1) : x));
  const asExtension = parsed.length === 1 && parsed[0].length >= 2 && parsed[0].length <= 6;
  const valid = asExtension || (parsed.length > 0 && parsed.every((x) => x.length === 10));
  const isGroup = parsed.length > 1;

  // Suggestions match the bit being typed, not the whole box - otherwise
  // adding a second number to a group would search for both at once.
  const [showList, setShowList] = useState(false);
  const segments = to.split(/[,;]/);
  const typing = (segments[segments.length - 1] ?? "").trim().toLowerCase();
  const typingDigits = typing.replace(/\D/g, "");
  const already = parsed.slice(0, -1);
  const matches = useMemo(() => {
    if (!typing) return [];
    return suggestions
      .filter((x) => {
        const key = x.kind === "extension" ? x.number : x.number.slice(-10);
        if (already.includes(key)) return false;
        // A colleague can only be messaged on their own, so once there
        // is more than one recipient they stop being offered.
        if (x.kind === "extension" && segments.length > 1) return false;
        return typingDigits.length >= 2
          ? key.includes(typingDigits)
          : x.label.toLowerCase().includes(typing);
      })
      .slice(0, 6);
  }, [suggestions, typing, typingDigits, already.join(","), segments.length]);

  /** Replaces the part being typed with a chosen number. */
  function choose(value: string, kind?: "number" | "extension") {
    const head = segments.slice(0, -1).map((x) => x.trim()).filter(Boolean);
    const shown = kind === "extension" ? value : formatPhone(value) || value;
    setTo([...head, shown].join(", "));
    setShowList(false);
  }

  async function send() {
    if (!valid || !text.trim() || sending) return;
    const pretty = parsed.map((n) => formatPhone(n) || n).join(", ");
    const ok = await confirm({
      title: isGroup ? `Text ${parsed.length} people?` : `Text ${pretty}?`,
      description:
        `This starts a ${isGroup ? "group " : ""}conversation with ${pretty} from ` +
        `${formatPhone(from) || from}. ${isGroup ? "They will all see each other's replies. " : ""}` +
        `Check the number${isGroup ? "s are" : " is"} right — nobody here has texted us before.`,
      confirmLabel: "Send text",
    });
    if (!ok) return;

    setSending(true);
    try {
      const res = await fetch("/api/ringlogix/messages/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: parsed.join(","),
          fromNumber: from,
          text: text.trim(),
          domain,
          // Only a group gets a name here; naming a one-to-one is done
          // from the conversation, where you can see who it is.
          name: isGroup ? groupName.trim() : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Couldn't send that");
      toast.success(
        data.joinedExisting
          ? `Added to the conversation already open with ${pretty}.`
          : isGroup
            ? `Started ${data.name ? `“${data.name}”` : "a group"} with ${parsed.length} people.`
            : `Texted ${pretty}.`,
      );
      onSent(data.sessionId ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that");
    } finally {
      setSending(false);
    }
  }

  const field = "w-full text-sm bg-[#fafafa] border border-[#eaeaea] rounded-lg px-3 py-2 outline-none focus:border-[#0070f3] focus:bg-white transition-colors";
  return (
    <div className="h-full min-h-0 flex flex-col">
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#eaeaea] shrink-0">
        <p className="text-sm font-semibold text-[#0a0a0a]">New message</p>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[#666] hover:bg-[#fafafa] transition-colors"
          data-tip="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
        <div>
          <label className="block text-[11px] font-medium text-[#666] mb-1.5">To</label>
          <div className="relative">
            <input
              className={field}
              placeholder="Name or number"
              value={to}
              onChange={(e) => { setTo(e.target.value); setShowList(true); }}
              onFocus={() => setShowList(true)}
              autoFocus
            />
            {showList && matches.length > 0 && (
              <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#eaeaea] rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                {matches.map((m) => (
                  <li key={`${m.number}-${m.from}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); choose(m.number, m.kind); }}
                      className="w-full text-left px-3 py-2 hover:bg-[#fafafa] transition-colors flex items-center gap-2.5"
                    >
                      <Avatar name={m.label} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-[#0a0a0a] truncate">{m.label}</span>
                        <span className="block text-[11px] text-[#999] tabular-nums">
                          {m.kind === "extension" ? `Ext ${m.number}` : formatPhone(m.number) || m.number} · {m.from}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {to.trim() !== "" && !valid && (
            <p className="text-[11px] text-[#b91c1c] mt-1">
              Ten digits each, separated by commas — or one extension for a colleague.
            </p>
          )}
          {valid && asExtension && (
            <p className="text-[11px] text-[#15803d] mt-1">
              Extension {parsed[0]} · an internal chat, not a text
            </p>
          )}
          {valid && !asExtension && (
            <p className="text-[11px] text-[#15803d] mt-1">
              {parsed.map((n) => formatPhone(n) || n).join(", ")}
              {isGroup && ` · a group of ${parsed.length}`}
            </p>
          )}
          <p className="text-[10px] text-[#bbb] mt-1">
            Add more numbers, separated by commas, to start a group. A colleague&apos;s
            extension can only be messaged on its own.
          </p>
        </div>

        {isGroup && !asExtension && (
          <div>
            <label className="block text-[11px] font-medium text-[#666] mb-1.5">
              Group name <span className="text-[#bbb] font-normal">optional</span>
            </label>
            <input
              className={field}
              placeholder="Salzer's — Friday install"
              maxLength={60}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <p className="text-[10px] text-[#bbb] mt-1">
              Everyone here sees it, in Teams too. You can change it later.
            </p>
          </div>
        )}

        <div className={asExtension ? "hidden" : ""}>
          <label className="block text-[11px] font-medium text-[#666] mb-1.5">From</label>
          {senders.length > 1 ? (
            <select className={field} value={from} onChange={(e) => setFrom(e.target.value)}>
              {senders.map((sdr) => (
                <option key={sdr.number} value={sdr.number}>
                  {formatPhone(sdr.number) || sdr.number} · ext {sdr.user}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-[#0a0a0a]">{formatPhone(from) || from || "—"}</p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#666] mb-1.5">Message</label>
          <textarea
            className={`${field} resize-none`}
            rows={5}
            placeholder="Write the text…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <button
          onClick={send}
          disabled={!valid || !text.trim() || sending || (!from && !asExtension)}
          className="w-full flex items-center justify-center gap-2 bg-[#0070f3] text-white text-sm font-medium rounded-xl py-2.5 hover:bg-[#0060df] transition-colors disabled:opacity-40"
        >
          {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
      </div>
    </div>
  );
}

// ── Notes and tags: the part RingLogix has nowhere to put ───────────────

function Details({
  conversation, annotation, contact, customer, customerId, displayName,
  names, meExtension, onSave, onContactSaved,
}: {
  conversation: SmsConversation;
  annotation: ThreadAnnotation | undefined;
  contact: { name: string; company: string } | undefined;
  customer: string;
  customerId: string;
  displayName: string;
  names: Record<string, string>;
  /** The signed-in person's own extension, where we could work it out. */
  meExtension: string;
  onSave: (patch: { notes?: string; tags?: string[] }) => Promise<boolean>;
  onContactSaved: () => void;
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
    <div className="h-full min-h-0 overflow-y-auto">
      {/* Who this is, before anything about the conversation. */}
      <div className="px-5 pt-5 pb-4 border-b border-[#f0f0f0]">
        <div className="flex items-start gap-3">
          <Avatar name={displayName} size="lg" />
          <div className="min-w-0 pt-1 flex-1">
            <p className="text-[15px] font-semibold text-[#0a0a0a] leading-tight truncate">{displayName}</p>
            <p className="text-[11px] text-[#999] truncate mt-0.5">
              {/* When it has a name, say who it actually is underneath. */}
              {conversation.name
                ? (conversation.isGroup
                    ? `Group · ${conversation.remoteNumbers.length} people`
                    : formatPhone(conversation.remote) || contact?.company || customer || "Conversation")
                : contact?.company || customer || (conversation.remote ? "Not in your contacts" : "Internal")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-3.5">
          {conversation.remote && (
            <a
              href={`tel:+${conversation.remote}`}
              data-tip="Call this number"
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#eff6ff] text-[#0070f3] text-[11px] font-semibold py-2 hover:bg-[#e0edff] transition-colors"
            >
              <Phone className="w-3.5 h-3.5" /> Call
            </a>
          )}
          {customerId && (
            <a
              href={`/customers/${customerId}`}
              data-tip="Open this customer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#fafafa] text-[#444] text-[11px] font-semibold py-2 hover:bg-[#f0f0f0] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Customer
            </a>
          )}
        </div>
      </div>

      <Section title="Details">
        {conversation.isGroup && conversation.remoteNumbers.length > 1 ? (
          <Row label="People">
            <span className="flex flex-col items-end gap-0.5">
              {conversation.remoteNumbers.map((n) => (
                <a key={n} href={`tel:+${n}`} className="text-[#0070f3] hover:underline tabular-nums">
                  {formatPhone(n) || n}
                </a>
              ))}
            </span>
          </Row>
        ) : conversation.remote ? (
          <Row label="Phone">
            <a href={`tel:+${conversation.remote}`} className="text-[#0070f3] hover:underline tabular-nums">
              {formatPhone(conversation.remote) || conversation.remote}
            </a>
          </Row>
        ) : null}
        {contact?.company && <Row label="Company">{contact.company}</Row>}
        {customer && <Row label="Customer">{customer}</Row>}
        {/* Your own extension, and - separately - the one this
            conversation belongs to. They are usually different: a shared
            number lives on one extension and everybody answers it, so
            labelling that one "Extension" read as though it were yours. */}
        <Row label="Your extension">{meExtension || "not matched"}</Row>
        <Row label="Conversation on">
          {conversation.user
            ? `Ext ${conversation.user}${names[conversation.user] ? ` · ${names[conversation.user]}` : ""}`
            : "—"}
        </Row>
        {conversation.ourNumber && (
          <Row label="Our number">
            <span className="tabular-nums">{formatPhone(conversation.ourNumber) || conversation.ourNumber}</span>
          </Row>
        )}
        <Row label="Status">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              conversation.unread ? "bg-[#eff6ff] text-[#0070f3]" : "bg-[#f0fdf4] text-[#15803d]"
            }`}
          >
            {conversation.unread ? "Unread" : "Read"}
          </span>
        </Row>
        {!contact && conversation.remote && !conversation.isGroup && (
          <div className="pt-3">
            <SaveContact conversation={conversation} suggested={customer} onSaved={onContactSaved} />
          </div>
        )}
      </Section>

      <Section title="Tags">
        <div className="flex flex-wrap gap-1.5">
          {MESSAGE_TAGS.map((t) => {
            const on = tags.includes(t.key);
            return (
              <button
                key={t.key}
                onClick={() => toggleTag(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  on ? t.className : "bg-white text-[#999] border border-[#eaeaea] hover:border-[#0070f3] hover:text-[#0070f3]"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${on ? t.dot : "bg-[#d4d4d4]"}`} />
                {t.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Notes"
        aside={
          status === "saving" ? <span className="text-[10px] text-[#999]">saving…</span>
          : status === "saved" ? (
            <span className="text-[10px] text-[#15803d] flex items-center gap-1">
              <Check className="w-3 h-3" /> saved
            </span>
          ) : null
        }
      >
        <textarea
          value={notes}
          onChange={(e) => { setTyped(e.target.value); setStatus("idle"); }}
          onBlur={commitNotes}
          rows={6}
          placeholder="What this is about, what was promised, who is handling it…"
          className="w-full resize-none text-sm bg-[#fafafa] border border-[#eaeaea] rounded-xl px-3 py-2.5 outline-none focus:border-[#0070f3] focus:bg-white transition-colors"
        />
        <p className="text-[10px] text-[#bbb] mt-1.5">
          {annotation?.updatedBy
            ? `Saved when you click away. Last noted by ${annotation.updatedBy}.`
            : "Saved when you click away. Everyone here sees it."}
        </p>
      </Section>
    </div>
  );
}

/** A titled block, so the panel reads as sections rather than a list. */
function Section({
  title, aside, children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 border-b border-[#f0f0f0] last:border-0">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest">{title}</p>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Label on the left, value on the right - the shape a record reads in. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px]">
      <span className="text-[11px] text-[#999] shrink-0">{label}</span>
      <span className="text-[13px] font-medium text-[#0a0a0a] truncate text-right">{children}</span>
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
  const [contacts, setContacts] = useState<Record<string, { name: string; company: string }>>({});
  const [annotations, setAnnotations] = useState<Record<string, ThreadAnnotation>>({});
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showDetails, setShowDetails] = useState(true);
  // Below lg there is no room for a third column, so the details take
  // over the conversation pane instead - with its own state, or opening
  // the rail on a desktop would hide the thread on a phone.
  const [mobileDetails, setMobileDetails] = useState(false);
  // Below md there is only room for one pane. Opening a conversation
  // moves to it; a back arrow returns.
  const [pane, setPane] = useState<"list" | "thread">("list");
  const [composing, setComposing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [senders, setSenders] = useState<Array<{ number: string; user: string }>>([]);
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
      setContacts(data.contacts ?? {});
      setSenders(data.senders ?? []);
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
    const map = new Map<string, { company: string; id: string }>();
    for (const c of customers) {
      const digits = (c.phone ?? "").replace(/\D/g, "").slice(-10);
      if (digits.length === 10) map.set(digits, { company: c.company, id: c.id });
    }
    return map;
  }, [customers]);

  const customerFor = useCallback(
    (remote: string) => (remote ? byNumber.get(remote.slice(-10))?.company ?? "" : ""),
    [byNumber],
  );

  const customerIdFor = useCallback(
    (remote: string) => (remote ? byNumber.get(remote.slice(-10))?.id ?? "" : ""),
    [byNumber],
  );

  const contactFor = useCallback(
    (remote: string) => (remote ? contacts[remote.slice(-10)] : undefined),
    [contacts],
  );

  /** What to call the other party, in order of how much we know. */
  const nameFor = useCallback(
    (c: SmsConversation) =>
      c.name || (!c.isGroup && contactFor(c.remote)?.name) || partyName(c, names, customerFor(c.remote), contacts),
    [contactFor, names, customerFor, contacts],
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
      // Digits only when the query has some. "".includes("") is true, so
      // matching the number against a stripped text query made every
      // conversation a match and the search did nothing at all.
      const digits = q.replace(/\D/g, "");
      const name = nameFor(c).toLowerCase();
      const tagLabels = knownTags(annotations[c.sessionId]?.tags)
        .map((t) => t.label.toLowerCase())
        .join(" ");
      return (
        name.includes(q) ||
        (digits.length >= 3 && (c.remote.includes(digits) || c.ourNumber.includes(digits))) ||
        c.lastMessage.toLowerCase().includes(q) ||
        tagLabels.includes(q) ||
        (annotations[c.sessionId]?.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversations, search, filter, nameFor, annotations]);

  const current = conversations.find((c) => c.sessionId === selected) ?? filtered[0];
  const unreadCount = conversations.filter((c) => c.unread).length;
  const taggedCount = conversations.filter((c) => annotations[c.sessionId]?.tags?.length).length;

  async function commitName(c: SmsConversation, value?: string) {
    const next = (value ?? draftName).replace(/\s+/g, " ").trim();
    setRenaming(false);
    if (next === c.name) return;
    try {
      const res = await fetch("/api/ringlogix/messages/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: c.sessionId, user: c.user, domain: c.domain, name: next,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Couldn't rename that");
      load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't rename that");
    }
  }

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

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ number: string; label: string; from: string; kind: "number" | "extension" }> = [];
    for (const c of conversations) {
      for (const n of c.remoteNumbers) {
        const key = n.slice(-10);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({
          number: n,
          label: c.isGroup ? formatPhone(n) || n : nameFor(c),
          from: "conversation",
          kind: "number",
        });
      }
    }
    for (const [digits, info] of Object.entries(contacts)) {
      if (seen.has(digits)) continue;
      seen.add(digits);
      out.push({ number: digits, label: info.name, from: "contact", kind: "number" });
    }
    // Colleagues, by extension. Not a text - an internal chat, which is
    // how people here message each other and what shows up in Teams.
    for (const [ext, name] of Object.entries(names)) {
      if (ext === meExtension) continue;
      out.push({ number: ext, label: name, from: `colleague · ext ${ext}`, kind: "extension" });
    }
    return out;
  }, [conversations, contacts, nameFor, names, meExtension]);

  const FILTERS: { key: Filter; label: string; n: number; Icon: typeof Inbox }[] = [
    { key: "all", label: "All", n: conversations.length, Icon: Inbox },
    { key: "unread", label: "Unread", n: unreadCount, Icon: Mail },
    { key: "tagged", label: "Tagged", n: taggedCount, Icon: TagIcon },
  ];

  return (
    // Exactly the viewport, so the page itself never scrolls: the shell is
    // 100vh with a 3.5rem bar and 2rem of padding top and bottom.
    // The viewport exactly, so the page itself never scrolls: the shell
    // is 100vh with a bar and its own padding. dvh on small screens,
    // where the browser's own chrome comes and goes as you scroll.
    <div className="flex flex-col h-[calc(100dvh-11.5rem)] md:h-[calc(100vh-7.5rem)] min-h-125 md:min-h-0">
      <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-[#0a0a0a]">Messages</h1>
          {/* Deliberately not "the same ones that appear in Teams", which
              was true and read as a dependency: this talks to RingLogix,
              and Teams is a second reader of the same mailbox. */}
          <p className="text-sm text-[#666] mt-0.5">
            Texts to and from our numbers, straight from the phone system
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
            <aside
              className={`md:border-r border-[#eaeaea] flex-col min-h-0 ${
                pane === "list" ? "flex" : "hidden md:flex"
              }`}
            >
              <div className="p-3 border-b border-[#eaeaea] space-y-2.5 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-[#999] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full text-sm bg-[#fafafa] border border-[#eaeaea] rounded-lg pl-9 pr-3 py-1.5 outline-none focus:border-[#0070f3] focus:bg-white transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => { setComposing(true); setPane("thread"); }}
                    disabled={senders.length === 0}
                    data-tip="Text a number we haven't spoken to"
                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#0070f3] text-white hover:bg-[#0060df] transition-colors disabled:opacity-40 shrink-0"
                  >
                    <PenSquare className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  {search.trim() && (
                    <span className="text-[11px] text-[#999] px-1">
                      {filtered.length} of {conversations.length}
                    </span>
                  )}
                  {FILTERS.map((f) => {
                    const on = filter === f.key;
                    return (
                      <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                          on ? "bg-[#eff6ff] text-[#0070f3]" : "text-[#999] hover:bg-[#fafafa] hover:text-[#444]"
                        }`}
                      >
                        <f.Icon className="w-3.5 h-3.5" />
                        {f.label}
                        {f.n > 0 && (
                          <span
                            className={`rounded px-1 text-[10px] font-semibold ${
                              on ? "bg-[#0070f3] text-white" : "bg-[#f0f0f0] text-[#666]"
                            }`}
                          >
                            {f.n}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {filtered.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-xs text-[#999]">
                      {conversations.length === 0
                        ? "No texts yet."
                        : search.trim()
                          ? `Nothing matches “${search.trim()}”.`
                          : "Nothing in this view."}
                    </p>
                    {search.trim() && (
                      <button
                        onClick={() => setSearch("")}
                        className="mt-2 text-xs text-[#0070f3] hover:underline"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                )}
                {filtered.map((c) => {
                  const active = current?.sessionId === c.sessionId;
                  const name = nameFor(c);
                  const tags = knownTags(annotations[c.sessionId]?.tags);
                  return (
                    <button
                      key={c.sessionId}
                      onClick={() => { setSelected(c.sessionId); setPane("thread"); setComposing(false); setRenaming(false); }}
                      className={`w-full text-left px-3 py-2.5 border-b border-[#f5f5f5] flex gap-2.5 transition-colors ${
                        active ? "bg-[#fafafa]" : "hover:bg-[#fafafa]"
                      }`}
                    >
                      <Avatar name={name} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm truncate ${c.unread ? "font-semibold text-[#0a0a0a]" : "text-[#444]"}`}>
                          {name}
                        </span>
                        <span className="block text-xs text-[#999] truncate mt-0.5">
                          {c.theirTurn ? "" : "You: "}
                          {c.lastMessage.replace(/\s+/g, " ") || "(media)"}
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
                      {/* Time, with the unread mark beneath it - the way
                          every phone shows it, and it leaves the preview
                          a full line rather than sharing one with a dot. */}
                      <span className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                        <span className="text-[10px] text-[#bbb] whitespace-nowrap">{shortTime(c.lastAt)}</span>
                        {c.unread && (
                          <span
                            data-tip="Unread"
                            className="w-2 h-2 rounded-full bg-[#0070f3]"
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* ── The conversation ── */}
            <section
              className={`flex-col min-h-0 min-w-0 ${pane === "thread" ? "flex" : "hidden md:flex"}`}
            >
              {composing ? (
                <NewMessage
                  senders={senders}
                  domain={conversations[0]?.domain ?? ""}
                  suggestions={suggestions}
                  onClose={() => { setComposing(false); setPane("list"); }}
                  onSent={(sessionId) => {
                    setComposing(false);
                    // Straight into the conversation it created, which is
                    // where anybody who just sent a text wants to be.
                    if (sessionId) setSelected(sessionId);
                    load(true);
                  }}
                />
              ) : current ? (
                <>
                  <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#eaeaea] shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        onClick={() => { setPane("list"); setMobileDetails(false); }}
                        data-tip="Back to conversations"
                        className="md:hidden flex items-center justify-center w-8 h-8 -ml-1 rounded-lg text-[#444] hover:bg-[#fafafa] transition-colors shrink-0"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <Avatar name={nameFor(current)} />
                      <div className="min-w-0">
                        {renaming ? (
                          <input
                            autoFocus
                            value={draftName}
                            maxLength={60}
                            onChange={(e) => setDraftName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); commitName(current); }
                              if (e.key === "Escape") setRenaming(false);
                            }}
                            placeholder={current.isGroup ? "Name this group" : "Name this conversation"}
                            className="w-full text-sm text-[#0a0a0a] bg-white border border-[#0070f3] rounded-lg px-2.5 py-1.5 outline-none transition-colors"
                          />
                        ) : (
                          <p className="text-sm font-semibold text-[#0a0a0a] truncate">
                            {nameFor(current)}
                          </p>
                        )}
                        <p className={`text-[11px] text-[#999] truncate items-center gap-2 ${renaming ? "hidden" : "flex"}`}>
                          {current.isGroup && current.remoteNumbers.length > 1
                            ? `Group · ${current.remoteNumbers.length} people`
                            : current.remote
                              ? formatPhone(current.remote) || current.remote
                              : `Extension ${current.remoteExtension}`}
                          {current.muted && (
                            <span className="inline-flex items-center gap-1"><BellOff className="w-3 h-3" /> muted</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {renaming ? (
                        <>
                          <button
                            onClick={() => commitName(current)}
                            className="flex items-center gap-1.5 bg-[#0070f3] text-white text-[11px] font-medium px-2.5 h-8 rounded-lg hover:bg-[#0060df] transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Save
                          </button>
                          <button
                            onClick={() => setRenaming(false)}
                            className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[11px] font-medium text-[#444] px-2.5 h-8 rounded-lg hover:bg-[#fafafa] transition-colors"
                          >
                            Cancel
                          </button>
                          {current.name && (
                            <button
                              onClick={() => { setDraftName(""); commitName(current, ""); }}
                              data-tip="Remove the name"
                              className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#eaeaea] bg-white text-[#b91c1c] hover:bg-[#fef2f2] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => { setDraftName(current.name); setRenaming(true); }}
                          data-tip={current.name ? "Rename this conversation" : "Give this conversation a name"}
                          className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#eaeaea] bg-white text-[#444] hover:bg-[#fafafa] transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* Not `hidden`: the attribute sets display:none and
                          the element's own flex class overrides it, so the
                          button stayed on screen mid-rename. */}
                      {!renaming && (
                      <button
                        onClick={() => setRead(current, current.unread)}
                        data-tip={current.unread ? "Mark read, here and in Teams" : "Mark unread, here and in Teams"}
                        className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[11px] font-medium text-[#444] px-2.5 h-8 rounded-lg hover:bg-[#fafafa] transition-colors"
                      >
                        {current.unread ? <MailOpen className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                        {current.unread ? "Mark read" : "Mark unread"}
                      </button>
                      )}
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
                        contact={contactFor(current.remote)}
                        customer={customerFor(current.remote)}
                        customerId={customerIdFor(current.remote)}
                        displayName={nameFor(current)}
                        onContactSaved={() => load(true)}
                        names={names}
                        meExtension={meExtension}
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
                      meName={authUser?.displayName ?? ""}
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
                  contact={contactFor(current.remote)}
                  customer={customerFor(current.remote)}
                  customerId={customerIdFor(current.remote)}
                  displayName={nameFor(current)}
                  onContactSaved={() => load(true)}
                  names={names}
                  meExtension={meExtension}
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
