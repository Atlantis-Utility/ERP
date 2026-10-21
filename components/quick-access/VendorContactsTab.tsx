"use client";

import { useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, Phone, Mail, ExternalLink, LifeBuoy, Search, Building2, Download, Star,
  ChevronLeft, Globe, StickyNote, UserRound,
} from "lucide-react";
import BrandLogo from "@/components/quick-access/BrandLogo";
import VendorContactDrawer from "@/components/quick-access/VendorContactDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import CopyButton from "@/components/ui/CopyButton";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";
import { getAvatarColor, getInitials } from "@/lib/utils";
import {
  useVendorContactsLive,
  removeVendorContact,
  saveVendorContact,
  seedVendorContacts,
  vendorLogoDomain,
  vendorPeople,
  mainVendorPerson,
  VENDOR_CATEGORIES,
  VENDOR_SEED,
  type VendorContact,
  type VendorPerson,
} from "@/lib/db/vendor-contacts";

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

function Logo({ vendor, size }: { vendor: VendorContact; size: number }) {
  return (
    <div className="flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      {/* Same logo treatment as the Links tab: bundled asset first,
          Clearbit by domain second, generic icon last. */}
      <BrandLogo
        logoFile={vendor.logoFile || undefined}
        logoDir={vendor.logoDir || "quick-access-logos"}
        domain={vendorLogoDomain(vendor)}
        label={vendor.company}
        fallback={Building2}
        fallbackClassName="w-1/2 h-1/2 text-[#bbb]"
        size={size}
        rounded={vendor.logoRounded}
      />
    </div>
  );
}

function Avatar({ person, size = "w-8 h-8" }: { person: VendorPerson; size?: string }) {
  const who = person.name || person.title || person.email || person.phone;
  const c = getAvatarColor(who);
  return (
    <div className={`${size} rounded-full ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
      <span className="text-[11px] font-semibold">{getInitials(who)}</span>
    </div>
  );
}

/**
 * Vendor support contacts as an address book: the vendors down the left,
 * everything about the one you picked on the right.
 *
 * It was a wall of cards, and with some vendors fully filled in and others
 * bare, the wall had holes in it and no obvious place to look. A list is
 * one place to look, it says who the main contact is before you open
 * anything, and the detail pane puts that person and a Call button first.
 */
export default function VendorContactsTab() {
  const { authUser } = useAuth();
  const isAdmin = Boolean(authUser?.isAdmin);

  const { contacts, reload } = useVendorContactsLive();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Phones show one pane at a time; this is which.
  const [mobileDetail, setMobileDetail] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<VendorContact | null>(null);
  const [deleting, setDeleting] = useState<VendorContact | null>(null);
  const [busy, setBusy] = useState(false);
  const { success, error: notifyError } = useToast();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [
        c.company,
        c.category,
        c.accountNumber,
        c.supportPhone,
        c.supportEmail,
        ...vendorPeople(c).flatMap((p) => [p.name, p.title, p.phone, p.email]),
        c.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [contacts, query]);

  // Grouped the way people think about them: "which ISP", "which carrier".
  const groups = useMemo(
    () =>
      VENDOR_CATEGORIES.map((category) => ({
        category,
        vendors: filtered.filter((c) => c.category === category),
      })).filter((g) => g.vendors.length > 0),
    [filtered],
  );

  // The picked vendor, or the first one showing when nothing is picked or
  // the search has hidden it, so the right-hand side is never blank.
  const selected =
    filtered.find((c) => c.id === selectedId) ?? groups[0]?.vendors[0] ?? null;

  const missingSeed = useMemo(() => {
    const have = new Set(contacts.map((c) => c.company.trim().toLowerCase()));
    return VENDOR_SEED.filter((s) => !have.has(s.company.trim().toLowerCase()));
  }, [contacts]);

  function select(c: VendorContact) {
    setSelectedId(c.id);
    setMobileDetail(true);
  }

  function edit(c: VendorContact | null) {
    setEditing(c);
    setDrawerOpen(true);
  }

  async function makeMain(vendor: VendorContact, person: VendorPerson) {
    try {
      await saveVendorContact({
        ...vendor,
        people: vendorPeople(vendor).map((p) => ({ ...p, primary: p.id === person.id })),
      });
      success(`${person.name || "They"} ${person.name ? "is" : "are"} now the main contact for ${vendor.company}`);
      reload();
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function runSeed() {
    setBusy(true);
    try {
      const n = await seedVendorContacts(contacts);
      success(n === 0 ? "Already up to date" : `Added ${n} provider${n === 1 ? "" : "s"}`);
      reload();
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to add providers");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await removeVendorContact(deleting.id);
      success(`Removed ${deleting.company}`);
      setDeleting(null);
      setMobileDetail(false);
      reload();
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {contacts.length === 0 ? (
        <div className="bg-white border border-[#eaeaea] rounded-xl py-20 text-center">
          <Building2 className="w-5 h-5 text-[#ccc] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">No vendor contacts yet</p>
          <p className="text-xs text-[#999] max-w-sm mx-auto">
            {isAdmin
              ? "Add the providers we use, then fill in each one's support line and point of contact."
              : "An admin hasn't added any vendor contacts yet."}
          </p>
          {isAdmin && (
            <div className="flex items-center justify-center gap-2 mt-5">
              {missingSeed.length > 0 && (
                <button
                  onClick={runSeed}
                  disabled={busy}
                  className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#0a0a0a] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Add our {missingSeed.length} providers
                </button>
              )}
              <button
                onClick={() => edit(null)}
                className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add vendor
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden grid md:grid-cols-[300px_minmax(0,1fr)] md:h-[calc(100dvh-15rem)] md:min-h-[520px]">
          {/* ── Vendor list ── */}
          <div className={`${mobileDetail ? "hidden md:flex" : "flex"} flex-col min-h-0 md:border-r border-[#eaeaea]`}>
            <div className="p-3 border-b border-[#eaeaea] space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#bbb] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search vendors or people…"
                  className="w-full border border-[#eaeaea] rounded-lg pl-9 pr-3 py-1.5 text-[13px] text-[#0a0a0a] placeholder:text-[#bbb] focus:outline-none focus:border-[#0070f3] transition-colors bg-white"
                />
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <button
                    onClick={() => edit(null)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#0a0a0a] text-white text-[12px] font-medium px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add vendor
                  </button>
                  {missingSeed.length > 0 && (
                    <button
                      onClick={runSeed}
                      disabled={busy}
                      title={`Add the ${missingSeed.length} providers we use that aren't listed yet`}
                      className="flex items-center justify-center gap-1.5 border border-[#eaeaea] bg-white text-[12px] font-medium text-[#0a0a0a] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {missingSeed.length}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {groups.length === 0 ? (
                <p className="text-xs text-[#999] text-center py-10 px-4">Nothing matches “{query}”.</p>
              ) : (
                groups.map((g) => (
                  <div key={g.category}>
                    <p className="sticky top-0 z-10 bg-[#fafafa] border-b border-[#f0f0f0] px-4 py-1.5 text-[10px] font-semibold text-[#999] uppercase tracking-wider">
                      {g.category} · {g.vendors.length}
                    </p>
                    {g.vendors.map((c) => {
                      const main = mainVendorPerson(c);
                      const active = selected?.id === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => select(c)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-l-2 transition-colors ${
                            active ? "bg-[#f5f5f5] border-[#0a0a0a]" : "border-transparent hover:bg-[#fafafa]"
                          }`}
                        >
                          <Logo vendor={c} size={28} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-[#0a0a0a] truncate">{c.company}</p>
                            <p className="text-[11px] text-[#999] truncate flex items-center gap-1">
                              {main ? (
                                <>
                                  {main.primary && <Star className="w-2.5 h-2.5 fill-[#f59e0b] text-[#f59e0b] shrink-0" />}
                                  <span className="truncate">{main.name || main.title || main.email}</span>
                                </>
                              ) : vendorPeople(c).length > 0 ? (
                                `${vendorPeople(c).length} contacts`
                              ) : c.supportPhone ? (
                                c.supportPhone
                              ) : (
                                "No contact yet"
                              )}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── Detail ── */}
          <div className={`${mobileDetail ? "block" : "hidden md:block"} min-h-0 overflow-y-auto`}>
            {selected ? (
              <VendorDetail
                vendor={selected}
                isAdmin={isAdmin}
                onBack={() => setMobileDetail(false)}
                onEdit={() => edit(selected)}
                onDelete={() => setDeleting(selected)}
                onMakeMain={(p) => makeMain(selected, p)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#999] py-20">Pick a vendor</div>
            )}
          </div>
        </div>
      )}

      {/* Mounted only while open, and keyed per vendor, so the form always
          starts from the record being edited. */}
      {drawerOpen && (
        <VendorContactDrawer
          key={editing?.id ?? "new"}
          contact={editing}
          onClose={() => setDrawerOpen(false)}
          onSaved={(message) => {
            success(message);
            // Shown now, not whenever the change feed gets round to it.
            reload();
          }}
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
    </div>
  );
}

function VendorDetail({
  vendor: c,
  isAdmin,
  onBack,
  onEdit,
  onDelete,
  onMakeMain,
}: {
  vendor: VendorContact;
  isAdmin: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMakeMain: (p: VendorPerson) => void;
}) {
  const people = vendorPeople(c);
  const main = mainVendorPerson(c);
  const others = people.filter((p) => p.id !== main?.id);
  const website = c.website?.trim();
  const websiteHref = website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : undefined;
  const hasSupport = Boolean(c.supportPhone || c.supportEmail || c.portal || c.supportUrl);

  return (
    <div>
      {/* Header */}
      <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-[#eaeaea]">
        <button onClick={onBack} className="md:hidden flex items-center gap-1 text-[12px] font-medium text-[#666] mb-3 -ml-1">
          <ChevronLeft className="w-4 h-4" />
          All vendors
        </button>
        <div className="flex items-start gap-3.5">
          <Logo vendor={c} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-[#0a0a0a]">{c.company}</h2>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#f1f1f1] text-[#666]">
                {c.category}
              </span>
            </div>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-[12px] text-[#666]">
              {c.accountNumber && (
                <span className="flex items-center gap-1">
                  Account <span className="text-[#0a0a0a] font-medium">{c.accountNumber}</span>
                  <CopyButton value={c.accountNumber} label="account number" />
                </span>
              )}
              {websiteHref && (
                <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#0070f3] hover:underline">
                  <Globe className="w-3 h-3" />
                  {vendorLogoDomain(c) ?? website}
                </a>
              )}
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 border border-[#eaeaea] bg-white text-[12px] font-medium text-[#0a0a0a] px-2.5 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
              <button
                onClick={onDelete}
                aria-label={`Remove ${c.company}`}
                className="p-1.5 rounded-lg text-[#999] hover:bg-[#fdeaea] hover:text-[#f31260] transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-6">
        {/* Main contact */}
        <section>
          <SectionTitle>Main contact</SectionTitle>
          {main ? (
            <div className="border border-[#eaeaea] rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Avatar person={main} size="w-10 h-10" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#0a0a0a] truncate flex items-center gap-1.5">
                    {main.name || main.title || "Unnamed contact"}
                    {main.primary && <Star className="w-3.5 h-3.5 fill-[#f59e0b] text-[#f59e0b] shrink-0" aria-label="Main contact" />}
                  </p>
                  {main.name && main.title && <p className="text-[12px] text-[#666] truncate">{main.title}</p>}
                </div>
              </div>
              {(main.phone || main.email) && (
                <div className="flex flex-wrap gap-2 mt-3.5">
                  {main.phone && (
                    <a
                      href={telHref(main.phone)}
                      className="flex items-center gap-2 bg-[#0a0a0a] text-white text-[13px] font-medium px-3.5 py-2 rounded-lg hover:bg-[#333] transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Call {main.phone}
                    </a>
                  )}
                  {main.email && (
                    <a
                      href={`mailto:${main.email}`}
                      className="flex items-center gap-2 border border-[#eaeaea] bg-white text-[13px] font-medium text-[#0a0a0a] px-3.5 py-2 rounded-lg hover:bg-[#fafafa] transition-colors min-w-0"
                    >
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{main.email}</span>
                    </a>
                  )}
                </div>
              )}
              {!main.primary && people.length === 1 && (
                <p className="text-[11px] text-[#999] mt-3">The only contact on file.</p>
              )}
            </div>
          ) : (
            <div className="border border-dashed border-[#d4d4d4] rounded-xl px-4 py-3.5 flex items-center gap-3">
              <UserRound className="w-4 h-4 text-[#bbb] shrink-0" />
              <p className="text-[12px] text-[#666] flex-1">
                {people.length > 1
                  ? isAdmin
                    ? "No main contact set. Use “Make main” on one of the people below so everyone calls the same person."
                    : "No main contact set yet. Everyone on file is listed below."
                  : c.supportPhone || c.supportEmail
                    ? "No named contact yet. Use the support line below."
                    : "No contact on file yet."}
              </p>
              {isAdmin && people.length === 0 && (
                <button onClick={onEdit} className="shrink-0 text-[12px] font-medium text-[#0070f3] hover:underline">
                  Add one
                </button>
              )}
            </div>
          )}
        </section>

        {/* Support */}
        {hasSupport && (
          <section>
            <SectionTitle>Support</SectionTitle>
            <dl className="border border-[#eaeaea] rounded-xl">
              {c.supportPhone && (
                <InfoRow icon={Phone} label="Phone" copy={c.supportPhone}>
                  <a href={telHref(c.supportPhone)} className="text-[#0070f3] hover:underline">{c.supportPhone}</a>
                </InfoRow>
              )}
              {c.supportEmail && (
                <InfoRow icon={Mail} label="Email" copy={c.supportEmail}>
                  <a href={`mailto:${c.supportEmail}`} className="text-[#0070f3] hover:underline break-all">{c.supportEmail}</a>
                </InfoRow>
              )}
              {c.portal && (
                <InfoRow icon={ExternalLink} label="Portal">
                  <a href={c.portal} target="_blank" rel="noopener noreferrer" className="text-[#0070f3] hover:underline">
                    Open portal ↗
                  </a>
                </InfoRow>
              )}
              {/* The account you log into and the form you raise a ticket
                  on are different errands. */}
              {c.supportUrl && (
                <InfoRow icon={LifeBuoy} label="Tickets">
                  <a href={c.supportUrl} target="_blank" rel="noopener noreferrer" className="text-[#0070f3] hover:underline">
                    Raise a ticket ↗
                  </a>
                </InfoRow>
              )}
            </dl>
          </section>
        )}

        {/* Everyone else at the vendor: which one you want depends on
            whether you're chasing an invoice or an outage. */}
        {others.length > 0 && (
          <section>
            <SectionTitle>{main ? `Other contacts · ${others.length}` : `Contacts · ${others.length}`}</SectionTitle>
            <div className="border border-[#eaeaea] rounded-xl">
              {others.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-t border-[#f0f0f0] first:border-t-0">
                  <Avatar person={p} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[#0a0a0a] truncate">{p.name || p.title || "Unnamed contact"}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] mt-0.5">
                      {p.name && p.title && <span className="text-[#999]">{p.title}</span>}
                      {p.phone && (
                        <a href={telHref(p.phone)} className="text-[#0070f3] hover:underline flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {p.phone}
                        </a>
                      )}
                      {p.email && (
                        <a href={`mailto:${p.email}`} className="text-[#0070f3] hover:underline flex items-center gap-1 min-w-0">
                          <Mail className="w-3 h-3 shrink-0" />
                          <span className="truncate">{p.email}</span>
                        </a>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => onMakeMain(p)}
                      title="Make this the main contact"
                      className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-[#666] border border-[#eaeaea] bg-white px-2 py-1 rounded-md hover:text-[#0a0a0a] hover:border-[#d4d4d4] transition-colors"
                    >
                      <Star className="w-3 h-3" />
                      <span className="hidden sm:inline">Make main</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {c.notes && (
          <section>
            <SectionTitle>Notes</SectionTitle>
            <div className="flex gap-2.5 bg-[#fafafa] border border-[#f0f0f0] rounded-xl px-4 py-3">
              <StickyNote className="w-3.5 h-3.5 text-[#bbb] mt-0.5 shrink-0" />
              <p className="text-[12px] text-[#444] whitespace-pre-wrap">{c.notes}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-semibold text-[#999] uppercase tracking-wider mb-2">{children}</h3>;
}

function InfoRow({
  icon: Icon,
  label,
  copy,
  children,
}: {
  icon: React.ElementType;
  label: string;
  copy?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 border-t border-[#f0f0f0] first:border-t-0">
      <dt className="w-20 shrink-0 flex items-center gap-2 text-[12px] text-[#999]">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </dt>
      <dd className="flex-1 min-w-0 text-[13px]">{children}</dd>
      {copy && <CopyButton value={copy} label={label.toLowerCase()} revealOnHover />}
    </div>
  );
}
