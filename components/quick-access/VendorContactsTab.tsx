"use client";

import { useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, Phone, Mail, ExternalLink, LifeBuoy, Search, Building2, Download, Star,
  LayoutGrid, Users,
} from "lucide-react";
import BrandLogo from "@/components/quick-access/BrandLogo";
import VendorContactDrawer from "@/components/quick-access/VendorContactDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";
import { getAvatarColor, getInitials } from "@/lib/utils";
import {
  useVendorContactsLive,
  removeVendorContact,
  seedVendorContacts,
  vendorLogoDomain,
  vendorPeople,
  mainVendorPerson,
  VENDOR_SEED,
  type VendorContact,
  type VendorPerson,
} from "@/lib/db/vendor-contacts";

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

// A way to reach them, as a pill: dialable, mailable or clickable, and only
// there when there's something to put in it. A blank renders nothing, so a
// card is as tall as what we know about the vendor and no taller.
function ReachPill({
  icon: Icon,
  label,
  href,
  external,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex items-center gap-1.5 max-w-full border border-[#eaeaea] bg-white rounded-lg px-2.5 py-1 text-[12px] text-[#0a0a0a] hover:border-[#d4d4d4] hover:bg-[#fafafa] transition-colors"
    >
      <Icon className="w-3.5 h-3.5 shrink-0 text-[#999]" />
      <span className="truncate">{label}</span>
    </a>
  );
}

function PersonReach({ person }: { person: VendorPerson }) {
  if (!person.phone && !person.email) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {person.phone && <ReachPill icon={Phone} label={person.phone} href={telHref(person.phone)} />}
      {person.email && <ReachPill icon={Mail} label={person.email} href={`mailto:${person.email}`} />}
    </div>
  );
}

function PersonName({ person }: { person: VendorPerson }) {
  const who = person.name || person.title || person.email || person.phone;
  const c = getAvatarColor(who);
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className={`w-7 h-7 rounded-full ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
        <span className="text-[10px] font-semibold">{getInitials(who)}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[#0a0a0a] truncate">{person.name || person.title || "Unnamed contact"}</p>
        {person.name && person.title && <p className="text-[11px] text-[#999] truncate">{person.title}</p>}
      </div>
    </div>
  );
}

function MainBadge({ short }: { short?: boolean }) {
  return (
    <span
      title="Main contact"
      className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-[#92400e] bg-[#fef3c7] border border-[#fcd34d] rounded-full px-2 py-0.5"
    >
      <Star className="w-2.5 h-2.5 fill-[#f59e0b] text-[#f59e0b]" />
      {short ? "Main" : "Main contact"}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-wider mb-2">{children}</p>;
}

export default function VendorContactsTab() {
  const { authUser } = useAuth();
  const isAdmin = Boolean(authUser?.isAdmin);

  const { contacts, reload } = useVendorContactsLive();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"vendors" | "people">("vendors");
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
        c.supportPhone,
        c.supportEmail,
        c.supportUrl ?? "",
        ...vendorPeople(c).flatMap((p) => [p.name, p.title, p.phone, p.email]),
        c.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [contacts, query]);

  // Everyone at every vendor, for the People view: for when you know who
  // you want but not which card they're on. A vendor's main contact first.
  const directory = useMemo(
    () =>
      filtered.flatMap((c) =>
        vendorPeople(c)
          .map((person) => ({ vendor: c, person, isMain: !!person.primary }))
          .sort((a, b) => Number(b.isMain) - Number(a.isMain)),
      ),
    [filtered],
  );

  const missingSeed = useMemo(() => {
    const have = new Set(contacts.map((c) => c.company.trim().toLowerCase()));
    return VENDOR_SEED.filter((s) => !have.has(s.company.trim().toLowerCase()));
  }, [contacts]);

  function edit(c: VendorContact) {
    setEditing(c);
    setDrawerOpen(true);
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
      reload();
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="w-3.5 h-3.5 text-[#bbb] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendors or people…"
            className="w-full border border-[#eaeaea] rounded-lg pl-9 pr-3 py-1.5 text-[13px] text-[#0a0a0a] placeholder:text-[#bbb] focus:outline-none focus:border-[#0070f3] transition-colors bg-white"
          />
        </div>

        <div className="flex items-center gap-0.5 p-0.5 bg-[#f5f5f5] rounded-lg shrink-0">
          {([
            { id: "vendors", label: "Vendors", icon: LayoutGrid },
            { id: "people", label: "People", icon: Users },
          ] as const).map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                view === v.id ? "bg-white text-[#0a0a0a] shadow-sm" : "text-[#666] hover:text-[#0a0a0a]"
              }`}
            >
              <v.icon className="w-3.5 h-3.5" />
              {v.label}
            </button>
          ))}
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
      ) : view === "people" ? (
        <PeopleTable rows={directory} />
      ) : (
        // Columns rather than a grid: a grid row is as tall as its tallest
        // card, so a vendor with three contacts left a hole under the one
        // beside it with none. Columns pack each card under the last.
        <div className="columns-1 lg:columns-2 2xl:columns-3 gap-4">
          {filtered.map((c) => (
            <VendorCard
              key={c.id}
              vendor={c}
              isAdmin={isAdmin}
              onEdit={() => edit(c)}
              onDelete={() => setDeleting(c)}
            />
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

function VendorCard({
  vendor: c,
  isAdmin,
  onEdit,
  onDelete,
}: {
  vendor: VendorContact;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const people = vendorPeople(c);
  const main = mainVendorPerson(c);
  // Only a tagged contact gets the badge; a lone contact is shown first all
  // the same, just without claiming somebody decided it.
  const tagged = !!main?.primary;
  const others = people.filter((p) => p.id !== main?.id);
  const hasSupport = Boolean(c.supportPhone || c.supportEmail || c.portal || c.supportUrl);
  const empty = !hasSupport && people.length === 0 && !c.notes;
  // Account and head-count when we have them, else where they live on the
  // web; "nothing on file" only when that's actually true.
  const summary =
    [
      c.accountNumber && `Acct ${c.accountNumber}`,
      people.length > 0 && `${people.length} contact${people.length === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" · ") ||
    vendorLogoDomain(c) ||
    (empty ? "No details on file yet" : "");

  return (
    <div className="break-inside-avoid mb-4 border border-[#eaeaea] rounded-xl bg-white hover:border-[#d4d4d4] transition-colors overflow-hidden">
      <div className={`flex items-start gap-3 px-4 pt-4 ${empty && !isAdmin ? "pb-4" : "pb-3"}`}>
        {/* Same logo treatment as the Links tab: bundled asset first,
            Clearbit by domain second, generic icon last. */}
        <div className="w-10 h-10 flex items-center justify-center shrink-0">
          <BrandLogo
            logoFile={c.logoFile || undefined}
            logoDir={c.logoDir || "quick-access-logos"}
            domain={vendorLogoDomain(c)}
            label={c.company}
            fallback={Building2}
            fallbackClassName="w-6 h-6 text-[#bbb]"
            size={36}
            rounded={c.logoRounded}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#0a0a0a] truncate">{c.company}</p>
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#f1f1f1] text-[#666] shrink-0">
              {c.category}
            </span>
          </div>
          {summary && <p className="text-[11px] text-[#999] mt-0.5 truncate">{summary}</p>}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-[#999] hover:bg-[#f1f1f1] hover:text-[#0a0a0a] transition-colors"
              aria-label={`Edit ${c.company}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-[#999] hover:bg-[#fdeaea] hover:text-[#f31260] transition-colors"
              aria-label={`Remove ${c.company}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Who to call, before anything else on the card. */}
      {main && (
        <div
          className={`mx-4 mb-3 rounded-lg border px-3 py-2.5 ${
            tagged ? "border-[#fde68a] bg-[#fffbeb]" : "border-[#f0f0f0] bg-[#fafafa]"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <PersonName person={main} />
            {tagged && <MainBadge />}
          </div>
          <PersonReach person={main} />
        </div>
      )}

      {hasSupport && (
        <div className="px-4 pb-3">
          <SectionLabel>Support</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {c.supportPhone && <ReachPill icon={Phone} label={c.supportPhone} href={telHref(c.supportPhone)} />}
            {c.supportEmail && <ReachPill icon={Mail} label={c.supportEmail} href={`mailto:${c.supportEmail}`} />}
            {c.portal && <ReachPill icon={ExternalLink} label="Portal" href={c.portal} external />}
            {/* The account you log into and the form you raise a ticket on
                are different errands. */}
            {c.supportUrl && <ReachPill icon={LifeBuoy} label="Raise a ticket" href={c.supportUrl} external />}
          </div>
        </div>
      )}

      {/* Every named contact, not just the first: which one you want
          depends on whether you're chasing an invoice or an outage, and
          both have to be dialable from here. */}
      {others.length > 0 && (
        <div className="px-4 pb-3">
          <SectionLabel>{main ? "Other contacts" : "Contacts"}</SectionLabel>
          <div>
            {others.map((p) => (
              <div key={p.id} className="py-2 first:pt-0 last:pb-0 border-t border-[#f4f4f4] first:border-t-0">
                <PersonName person={p} />
                <PersonReach person={p} />
              </div>
            ))}
          </div>
        </div>
      )}

      {c.notes && (
        <p className="mx-4 mb-3 text-[11px] text-[#888] bg-[#fafafa] rounded-lg px-3 py-2 whitespace-pre-wrap">{c.notes}</p>
      )}

      {empty && isAdmin && (
        <button
          onClick={onEdit}
          className="mx-4 mb-4 flex items-center gap-1 text-[12px] font-medium text-[#0070f3] hover:underline"
        >
          <Plus className="w-3 h-3" />
          Add support details
        </button>
      )}

      {/* Sections carry their own bottom spacing; this tops up the last one
          to the card's padding. */}
      {!empty && <div className="h-1" />}
    </div>
  );
}

/**
 * Everyone at every vendor in one list: for when you know the person, or
 * the role, and not which card they're filed under.
 */
function PeopleTable({ rows }: { rows: { vendor: VendorContact; person: VendorPerson; isMain: boolean }[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-[#eaeaea] rounded-xl py-16 text-center">
        <Users className="w-5 h-5 text-[#ccc] mx-auto mb-3" />
        <p className="text-sm font-medium text-[#0a0a0a] mb-1">No named contacts</p>
        <p className="text-xs text-[#999]">Add people to a vendor and they&rsquo;ll be listed here.</p>
      </div>
    );
  }

  const cols = "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]";
  return (
    <div className="bg-white border border-[#eaeaea] rounded-xl overflow-hidden">
      <div className={`hidden md:grid ${cols} gap-4 px-4 py-2.5 bg-[#fafafa] border-b border-[#eaeaea] text-[10px] font-semibold text-[#999] uppercase tracking-wider`}>
        <span>Name</span>
        <span>Vendor</span>
        <span>Phone</span>
        <span>Email</span>
      </div>
      <div>
        {rows.map(({ vendor, person, isMain }) => (
          <div
            key={`${vendor.id}-${person.id}`}
            className={`grid grid-cols-1 ${cols} gap-x-4 gap-y-1.5 px-4 py-3 items-center border-t border-[#f4f4f4] first:border-t-0 hover:bg-[#fafafa] transition-colors`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <PersonName person={person} />
              {isMain && <MainBadge short />}
            </div>
            <p className="text-[12px] text-[#666] truncate">{vendor.company}</p>
            <div className="min-w-0 text-[12px]">
              {person.phone ? (
                <a href={telHref(person.phone)} className="inline-flex items-center gap-1.5 text-[#0070f3] hover:underline max-w-full">
                  <Phone className="w-3.5 h-3.5 text-[#999] shrink-0" />
                  <span className="truncate">{person.phone}</span>
                </a>
              ) : (
                <span className="hidden md:inline text-[#ccc]">No phone</span>
              )}
            </div>
            <div className="min-w-0 text-[12px]">
              {person.email ? (
                <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1.5 text-[#0070f3] hover:underline max-w-full">
                  <Mail className="w-3.5 h-3.5 text-[#999] shrink-0" />
                  <span className="truncate">{person.email}</span>
                </a>
              ) : (
                <span className="hidden md:inline text-[#ccc]">No email</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
