"use client";

import { useEffect, useState } from "react";
import Drawer from "@/components/ui/Drawer";
import { inputClass } from "@/components/ui/FormField";
import { getAvatarColor, getInitials } from "@/lib/utils";
import { getCompanyOverride, setCompanyOverride, getNotesOverride, addNoteOverride, removeNoteOverride } from "@/lib/outlook-company-overrides";
import {
  ExternalLink, Video, MapPin, User, Users, AlignLeft, Copy, Check, Phone, Link2, Clock,
  Building2, Pencil, StickyNote, Plus, X,
} from "lucide-react";

export interface OutlookAttendee {
  name:   string;
  email:  string;
  status: string;
}

export interface OutlookEvent {
  id:            string;
  title:         string;
  start:         string;
  end:           string;
  htmlLink:      string | null | undefined;
  onlineJoinUrl: string | null;
  isAllDay:      boolean;
  location?:     string | null;
  organizer?:    { name: string; email: string } | null;
  attendees?:    OutlookAttendee[];
  description?:  string | null;
}

const ATTENDEE_STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  accepted:            { label: "Accepted",  dot: "bg-[#22c55e]" },
  tentativelyAccepted: { label: "Tentative", dot: "bg-[#f59e0b]" },
  declined:            { label: "Declined",  dot: "bg-[#ef4444]" },
  organizer:           { label: "Organizer", dot: "bg-[#0070f3]" },
  notResponded:        { label: "No reply",  dot: "bg-[#ccc]"    },
  none:                { label: "No reply",  dot: "bg-[#ccc]"    },
};

function formatEventRange(start: string, end: string, isAllDay: boolean): string {
  if (isAllDay) return "All day";
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  if (!end || isNaN(e.getTime())) {
    return `${s.toLocaleDateString("en-US", dateOpts)} · ${s.toLocaleTimeString("en-US", timeOpts)}`;
  }
  if (sameDay) {
    return `${s.toLocaleDateString("en-US", dateOpts)} · ${s.toLocaleTimeString("en-US", timeOpts)} – ${e.toLocaleTimeString("en-US", timeOpts)}`;
  }
  return `${s.toLocaleDateString("en-US", dateOpts)} ${s.toLocaleTimeString("en-US", timeOpts)} – ${e.toLocaleDateString("en-US", dateOpts)} ${e.toLocaleTimeString("en-US", timeOpts)}`;
}

// Renders plain text with links turned into clickable anchors: matches full
// http(s) URLs as well as bare domain links like "meet.google.com/abc-defg"
// that meeting invites often include without a protocol prefix.
function linkifyText(text: string, keyPrefix: string): React.ReactNode[] {
  const urlPattern = /((?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\/[^\s]*)/g;
  const parts = text.split(urlPattern);
  return parts.map((part, i) => {
    if (i % 2 !== 1) return part;
    const href = /^https?:\/\//i.test(part) ? part : `https://${part}`;
    return (
      <a
        key={`${keyPrefix}-${i}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#0070f3] hover:underline wrap-break-word"
      >
        {part}
      </a>
    );
  });
}

// Meeting invites (Google Meet especially) pad the description with a long
// line of dashes/underscores as a visual divider. Strip those before
// deciding whether there's any real content to show.
function cleanDescription(text: string): string {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^[-_~:.\s]{8,}$/.test(line)) continue; // drop separator-only lines
    if (line === "" && lines[lines.length - 1] === "") continue; // collapse blank runs
    lines.push(line);
  }
  return lines.join("\n").trim();
}

interface JoinMethod {
  type:    string;
  primary: string;
  meta:    { label: string; value: string }[];
}

const JOIN_TYPE_CONFIG: Record<string, { label: string; icon: typeof Video }> = {
  video: { label: "Video call",   icon: Video },
  phone: { label: "Phone",        icon: Phone },
  more:  { label: "More options", icon: Link2 },
  sip:   { label: "SIP",          icon: Video },
};

// Google Meet invites synced through Graph repeat a "Link type:X" block for
// every way to join (video, phone, sip, ...). Parse that into structured
// join methods instead of dumping it as a wall of raw text.
function parseJoinMethods(text: string): { intro: string; methods: JoinMethod[] } {
  const lines = text.split("\n");
  const firstIdx = lines.findIndex((l) => /^link type:/i.test(l.trim()));
  if (firstIdx === -1) return { intro: text, methods: [] };

  const intro = lines.slice(0, firstIdx).join("\n").trim();
  const methods: JoinMethod[] = [];
  let i = firstIdx;
  while (i < lines.length) {
    const match = lines[i].trim().match(/^link type:(.+)$/i);
    if (!match) { i++; continue; }
    const type = match[1].trim().toLowerCase();
    i++;
    let primary = "";
    const meta: { label: string; value: string }[] = [];
    while (i < lines.length && !/^link type:/i.test(lines[i].trim())) {
      const line = lines[i].trim();
      i++;
      if (!line) continue;
      const kv = !/^https?:\/\//i.test(line) && line.match(/^([A-Za-z][A-Za-z ]*):(.+)$/);
      if (kv) meta.push({ label: kv[1].trim(), value: kv[2].trim() });
      else if (!primary) primary = line;
      else meta.push({ label: "", value: line });
    }
    if (primary || meta.length > 0) methods.push({ type, primary, meta });
  }
  return { intro, methods };
}

// Personal email providers, plus our own domain, have no *external* company to
// guess: skip these. (Atlantis Utility is us, not the client the event is with.)
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "live.com", "aol.com", "protonmail.com", "msn.com", "atlantisutility.com",
  // ksac.com is an external technician who is actually a team member, not a client.
  "ksac.com",
]);

// Graph doesn't expose a "company" field for attendees/organizer, only name + email,
// so this is a best-effort guess from the email domain, not an authoritative source.
export function companyFromEmail(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return null;
  const base = domain.split(".")[0];
  if (!base) return null;
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const NO_COMPANY_LABEL = "Atlantis Utility";

// Best-effort company guess for an Outlook event: prefer the organizer's
// domain, fall back to the first attendee whose domain resolves to one.
export function autoCompanyFromEvent(event: OutlookEvent): string | null {
  if (event.organizer?.email) {
    const c = companyFromEmail(event.organizer.email);
    if (c) return c;
  }
  for (const a of event.attendees ?? []) {
    if (a.email) {
      const c = companyFromEmail(a.email);
      if (c) return c;
    }
  }
  return null;
}

// Manual override (localStorage) wins, then the auto-detected external
// company, then the literal fallback — never silently defaults to us.
export function resolveEventCompany(event: OutlookEvent): string {
  return getCompanyOverride(event.id) ?? autoCompanyFromEvent(event) ?? NO_COMPANY_LABEL;
}

export default function OutlookEventDetailDrawer({
  event,
  open,
  onClose,
}: {
  event: OutlookEvent | null;
  open: boolean;
  onClose: () => void;
}) {
  const [locationCopied, setLocationCopied] = useState(false);
  const [companyEditing, setCompanyEditing] = useState(false);
  const [companyDraft, setCompanyDraft] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  // Notes live in localStorage, read fresh on every render — this setter's only
  // job is forcing that re-render after a delete, which touches no other state.
  const [, setNoteVersion] = useState(0);

  useEffect(() => {
    if (!open) {
      setCompanyEditing(false);
      setAddingNote(false);
    }
  }, [open]);

  if (!event) return null;

  const attendees = event.attendees ?? [];
  const company = resolveEventCompany(event);
  const notes = getNotesOverride(event.id);

  async function copyLocation() {
    if (!event?.location) return;
    try {
      await navigator.clipboard.writeText(event.location);
      setLocationCopied(true);
      setTimeout(() => setLocationCopied(false), 1500);
    } catch {}
  }

  function startEditCompany() {
    setCompanyDraft(company === NO_COMPANY_LABEL ? "" : company);
    setCompanyEditing(true);
  }

  function saveCompany() {
    if (!event) return;
    setCompanyOverride(event.id, companyDraft);
    setCompanyEditing(false);
  }

  function startAddNote() {
    setNoteDraft("");
    setAddingNote(true);
  }

  function saveNote() {
    if (!event) return;
    addNoteOverride(event.id, noteDraft);
    setAddingNote(false);
    setNoteVersion((v) => v + 1);
  }

  function deleteNote(noteId: string) {
    if (!event) return;
    removeNoteOverride(event.id, noteId);
    setNoteVersion((v) => v + 1);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={event.title}
      subtitle="Outlook Calendar event"
      footer={
        <>
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
            >
              Open in Outlook <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {event.onlineJoinUrl && (
            <a
              href={event.onlineJoinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#333] transition-colors"
            >
              <Video className="w-3.5 h-3.5" /> Join Meeting
            </a>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* Time */}
        <div className="flex items-start gap-3">
          <Clock className="w-4 h-4 text-[#999] shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-1">Time</p>
            <p className="text-sm text-[#0a0a0a]">{formatEventRange(event.start, event.end, event.isAllDay)}</p>
          </div>
        </div>

        {/* Company */}
        <div className="flex items-start gap-3">
          <Building2 className="w-4 h-4 text-[#999] shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-1">Company</p>
            {companyEditing ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  className={inputClass}
                  placeholder="e.g. Acme Corp"
                  value={companyDraft}
                  onChange={(e) => setCompanyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveCompany();
                    if (e.key === "Escape") setCompanyEditing(false);
                  }}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveCompany}
                    className="bg-[#0a0a0a] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setCompanyEditing(false)}
                    className="border border-[#eaeaea] bg-white text-xs font-medium text-[#444] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-[#0a0a0a] truncate">{company}</p>
                <button
                  onClick={startEditCompany}
                  className="flex items-center justify-center w-5 h-5 rounded-md bg-[#0a0a0a] text-white hover:bg-[#333] transition-colors shrink-0"
                  aria-label="Edit company"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Location */}
        {event.location && (
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-[#999] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-1">Location</p>
              <div className="flex items-center gap-2">
                <p className="text-sm text-[#0a0a0a] wrap-break-word flex-1 min-w-0">{event.location}</p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in Maps"
                  className="text-[#999] hover:text-[#0070f3] transition-colors shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={copyLocation}
                  title={locationCopied ? "Copied" : "Copy location"}
                  className="text-[#999] hover:text-[#0a0a0a] transition-colors shrink-0"
                >
                  {locationCopied ? <Check className="w-3.5 h-3.5 text-[#16a34a]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Organizer */}
        {event.organizer && (event.organizer.name || event.organizer.email) && (
          <div className="flex items-start gap-3">
            <User className="w-4 h-4 text-[#999] shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-1">Organizer</p>
              <p className="text-sm text-[#0a0a0a]">{event.organizer.name || event.organizer.email}</p>
              {event.organizer.email && event.organizer.name && event.organizer.name !== event.organizer.email && (
                <p className="text-xs text-[#999]">{event.organizer.email}</p>
              )}
            </div>
          </div>
        )}

        {/* Attendees */}
        {attendees.length > 0 && (
          <div className="flex items-start gap-3">
            <Users className="w-4 h-4 text-[#999] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-2">
                Attendees ({attendees.length})
              </p>
              <div className="space-y-2">
                {attendees.map((a, i) => {
                  const cfg = ATTENDEE_STATUS_CONFIG[a.status] ?? ATTENDEE_STATUS_CONFIG.none;
                  const c = getAvatarColor(a.name || a.email);
                  const company = a.email ? companyFromEmail(a.email) : null;
                  return (
                    <div key={`${a.email}-${i}`} className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
                        <span className="text-[10px] font-semibold">{getInitials(a.name || a.email)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[#0a0a0a] font-medium truncate">{a.name || a.email}</p>
                        {a.name && a.email && a.name !== a.email && (
                          <p className="text-xs text-[#999] truncate">{a.email}</p>
                        )}
                        {company && (
                          <p className="text-[10px] text-[#bbb] truncate">{company}</p>
                        )}
                      </div>
                      <span className={`flex items-center gap-1 text-[10px] font-medium text-[#666] shrink-0`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Description */}
        <div className="flex items-start gap-3">
          <AlignLeft className="w-4 h-4 text-[#999] shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-1">Description</p>
            {(() => {
              const cleaned = event.description ? cleanDescription(event.description) : "";
              if (cleaned.length === 0) {
                return <p className="text-sm text-[#bbb]">------</p>;
              }

              const { intro, methods } = parseJoinMethods(cleaned);
              if (methods.length === 0) {
                return (
                  <p className="text-sm text-[#444] leading-relaxed whitespace-pre-wrap wrap-break-word">
                    {linkifyText(cleaned, "desc")}
                  </p>
                );
              }

              return (
                <div className="space-y-3">
                  {intro && (
                    <p className="text-sm text-[#444] leading-relaxed whitespace-pre-wrap wrap-break-word">
                      {linkifyText(intro, "desc-intro")}
                    </p>
                  )}
                  <div className="space-y-2">
                    {methods.map((m, i) => {
                      const cfg = JOIN_TYPE_CONFIG[m.type] ?? {
                        label: m.type.charAt(0).toUpperCase() + m.type.slice(1),
                        icon: Link2,
                      };
                      const Icon = cfg.icon;
                      const isUrl = /^https?:\/\//i.test(m.primary) || /^[a-z0-9-]+\.[a-z]{2,}\//i.test(m.primary);
                      const href = isUrl
                        ? (/^https?:\/\//i.test(m.primary) ? m.primary : `https://${m.primary}`)
                        : null;
                      return (
                        <div key={i} className="flex items-start gap-2.5 border border-[#f0f0f0] rounded-lg px-3 py-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#fafafa] border border-[#f0f0f0] flex items-center justify-center shrink-0">
                            <Icon className="w-3.5 h-3.5 text-[#666]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wide">{cfg.label}</p>
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-[#0070f3] hover:underline wrap-break-word"
                              >
                                {m.primary}
                              </a>
                            ) : m.primary ? (
                              <p className="text-sm text-[#0a0a0a] wrap-break-word">{m.primary}</p>
                            ) : null}
                            {m.meta.map((meta, j) => (
                              <p key={j} className="text-xs text-[#999] mt-0.5">
                                {meta.label ? `${meta.label}: ` : ""}{meta.value}
                              </p>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Notes */}
        <div className="flex items-start gap-3">
          <StickyNote className="w-4 h-4 text-[#999] shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest">Notes</p>
              {!addingNote && (
                <button
                  onClick={startAddNote}
                  className="flex items-center gap-1 bg-[#0a0a0a] text-white text-[11px] font-medium px-2.5 py-1 rounded-md hover:bg-[#333] transition-colors shrink-0"
                >
                  <Plus className="w-3 h-3" /> Add Note
                </button>
              )}
            </div>

            {notes.length > 0 && (
              <div className="space-y-2 mb-2">
                {notes.map((n) => (
                  <div key={n.id} className="flex items-start gap-2 bg-[#fafafa] border border-[#f0f0f0] rounded-lg px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#444] leading-relaxed whitespace-pre-wrap wrap-break-word">{n.text}</p>
                      <p className="text-[10px] text-[#bbb] mt-1">
                        {new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteNote(n.id)}
                      className="text-[#ccc] hover:text-[#ef4444] transition-colors shrink-0"
                      aria-label="Delete note"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {addingNote ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder="Add a note…"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setAddingNote(false); }}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveNote}
                    className="bg-[#0a0a0a] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setAddingNote(false)}
                    className="border border-[#eaeaea] bg-white text-xs font-medium text-[#444] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : notes.length === 0 ? (
              <p className="text-sm text-[#bbb]">No notes yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
