"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, Phone, Mail, ExternalLink, User, Search, Building2, Download,
} from "lucide-react";
import BrandLogo from "@/components/quick-access/BrandLogo";
import VendorContactDrawer from "@/components/quick-access/VendorContactDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import {
  useVendorContacts,
  removeVendorContact,
  seedVendorContacts,
  vendorLogoDomain,
  VENDOR_SEED,
  type VendorContact,
} from "@/lib/db/vendor-contacts";

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-[#0a0a0a] text-white text-[13px] font-medium px-4 py-2.5 rounded-lg shadow-lg">
      {message}
    </div>
  );
}

// A labelled contact line that turns into a tel:/mailto: link when we have a
// value, and a muted em dash when we don't — so a blank field reads as "nobody
// has filled this in yet" rather than looking broken.
function ContactLine({
  icon: Icon,
  value,
  href,
}: {
  icon: React.ElementType;
  value: string;
  href?: string;
}) {
  if (!value) {
    return (
      <div className="flex items-center gap-2 text-[#ccc]">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[12px]">-</span>
      </div>
    );
  }
  const content = (
    <>
      <Icon className="w-3.5 h-3.5 shrink-0 text-[#999]" />
      <span className="text-[12px] truncate">{value}</span>
    </>
  );
  return href ? (
    <a href={href} className="flex items-center gap-2 text-[#0070f3] hover:underline min-w-0">
      {content}
    </a>
  ) : (
    <div className="flex items-center gap-2 text-[#666] min-w-0">{content}</div>
  );
}

export default function VendorContactsTab() {
  const { authUser } = useAuth();
  const isAdmin = Boolean(authUser?.isAdmin);

  const contacts = useVendorContacts();
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<VendorContact | null>(null);
  const [deleting, setDeleting] = useState<VendorContact | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.company, c.category, c.supportPhone, c.supportEmail, c.pocName, c.pocEmail, c.notes]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [contacts, query]);

  const missingSeed = useMemo(() => {
    const have = new Set(contacts.map((c) => c.company.trim().toLowerCase()));
    return VENDOR_SEED.filter((s) => !have.has(s.company.trim().toLowerCase()));
  }, [contacts]);

  async function runSeed() {
    setBusy(true);
    try {
      const n = await seedVendorContacts(contacts);
      setToast(n === 0 ? "Already up to date" : `Added ${n} provider${n === 1 ? "" : "s"}`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to add providers");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await removeVendorContact(deleting.id);
      setToast(`Removed ${deleting.company}`);
      setDeleting(null);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-[#bbb] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendors…"
            className="w-full border border-[#eaeaea] rounded-lg pl-9 pr-3 py-1.5 text-[13px] text-[#0a0a0a] placeholder:text-[#bbb] focus:outline-none focus:border-[#0070f3] transition-colors bg-white"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isAdmin && missingSeed.length > 0 && (
            <button
              onClick={runSeed}
              disabled={busy}
              className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#0a0a0a] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Add our {missingSeed.length} provider{missingSeed.length === 1 ? "" : "s"}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => { setEditing(null); setDrawerOpen(true); }}
              className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add vendor
            </button>
          )}
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="bg-white border border-[#eaeaea] rounded-xl py-20 text-center">
          <Building2 className="w-5 h-5 text-[#ccc] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">No vendor contacts yet</p>
          <p className="text-xs text-[#999] max-w-sm mx-auto">
            {isAdmin
              ? "Add the providers we use, then fill in each one's support line and point of contact."
              : "An admin hasn't added any vendor contacts yet."}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#eaeaea] rounded-xl py-20 text-center">
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">No matches</p>
          <p className="text-xs text-[#999]">Nothing matches “{query}”.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="border border-[#eaeaea] rounded-xl bg-white p-4 hover:border-[#d4d4d4] transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Same logo treatment as the Links tab: bundled asset first,
                    Clearbit by domain second, generic icon last. */}
                <div className="w-11 h-11 flex items-center justify-center shrink-0">
                  <BrandLogo
                    logoFile={c.logoFile || undefined}
                    logoDir={c.logoDir || "quick-access-logos"}
                    domain={vendorLogoDomain(c)}
                    label={c.company}
                    fallback={Building2}
                    fallbackClassName="w-6 h-6 text-[#bbb]"
                    size={40}
                    rounded={c.logoRounded}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#0a0a0a] truncate">{c.company}</p>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#f1f1f1] text-[#666] shrink-0">
                      {c.category}
                    </span>
                  </div>
                  {c.accountNumber && (
                    <p className="text-[11px] text-[#999] mt-0.5 truncate">Acct {c.accountNumber}</p>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setEditing(c); setDrawerOpen(true); }}
                      className="p-1.5 rounded-lg text-[#999] hover:bg-[#f1f1f1] hover:text-[#0a0a0a] transition-colors"
                      aria-label={`Edit ${c.company}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleting(c)}
                      className="p-1.5 rounded-lg text-[#999] hover:bg-[#fdeaea] hover:text-[#f31260] transition-colors"
                      aria-label={`Remove ${c.company}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 pt-3 border-t border-[#f7f7f7]">
                <div className="space-y-2 min-w-0">
                  <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-wider">Support</p>
                  <ContactLine icon={Phone} value={c.supportPhone} href={c.supportPhone ? `tel:${c.supportPhone.replace(/[^\d+]/g, "")}` : undefined} />
                  <ContactLine icon={Mail} value={c.supportEmail} href={c.supportEmail ? `mailto:${c.supportEmail}` : undefined} />
                  {c.portal && (
                    <a
                      href={c.portal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[#0070f3] hover:underline min-w-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-[12px] truncate">Portal</span>
                    </a>
                  )}
                </div>

                <div className="space-y-2 min-w-0">
                  <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-wider">
                    Point of contact
                  </p>
                  <ContactLine
                    icon={User}
                    value={c.pocName ? (c.pocTitle ? `${c.pocName} · ${c.pocTitle}` : c.pocName) : ""}
                  />
                  <ContactLine icon={Phone} value={c.pocPhone} href={c.pocPhone ? `tel:${c.pocPhone.replace(/[^\d+]/g, "")}` : undefined} />
                  <ContactLine icon={Mail} value={c.pocEmail} href={c.pocEmail ? `mailto:${c.pocEmail}` : undefined} />
                </div>
              </div>

              {c.notes && (
                <p className="text-[11px] text-[#888] mt-3 pt-3 border-t border-[#f7f7f7] whitespace-pre-wrap">
                  {c.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Mounted only while open, and keyed per vendor, so the form always
          starts from the record being edited. */}
      {drawerOpen && (
        <VendorContactDrawer
          key={editing?.id ?? "new"}
          contact={editing}
          onClose={() => setDrawerOpen(false)}
          onSaved={setToast}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Remove ${deleting?.company ?? ""}?`}
        description="This removes the vendor and its support contacts for everyone. This can't be undone."
        confirmLabel="Remove"
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}
