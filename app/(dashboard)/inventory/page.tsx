"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Package, Boxes } from "lucide-react";
import Header from "@/components/layout/Header";
import Select from "@/components/ui/Select";
import InventoryItemDrawer from "@/components/inventory/InventoryItemDrawer";
import {
  useInventory, isUnused, CATEGORY_LABELS, STATUS_LABELS,
  type InventoryItem, type InventoryCategory, type InventoryStatus,
} from "@/lib/db/inventory";

const statusStyle: Record<InventoryStatus, { bg: string; text: string; dot: string }> = {
  in_stock: { bg: "bg-[#e8f2ff]", text: "text-[#0070f3]", dot: "bg-[#0070f3]" },
  assigned: { bg: "bg-[#fff8e6]", text: "text-[#b45309]", dot: "bg-[#f5a524]" },
  deployed: { bg: "bg-[#e8fdf0]", text: "text-[#17c964]", dot: "bg-[#17c964]" },
  returned: { bg: "bg-[#f5f3ff]", text: "text-[#7c3aed]", dot: "bg-[#7c3aed]" },
  retired:  { bg: "bg-[#f5f5f5]", text: "text-[#888]",    dot: "bg-[#bbb]"    },
};

const categoryOptions = [
  { value: "all", label: "All Categories" },
  ...(Object.keys(CATEGORY_LABELS) as InventoryCategory[]).map((v) => ({ value: v, label: CATEGORY_LABELS[v] })),
];

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "unused", label: "Unused only" },
  ...(Object.keys(STATUS_LABELS) as InventoryStatus[]).map((v) => ({ value: v, label: STATUS_LABELS[v] })),
];

// SIMs are identified by ICCID, routers by IMEI, everything else by serial —
// show whichever one this item actually carries.
function identifier(item: InventoryItem): string {
  return item.iccid || item.imei || item.serial || "";
}

function identifierLabel(item: InventoryItem): string {
  if (item.iccid) return "ICCID";
  if (item.imei) return "IMEI";
  if (item.serial) return "Serial";
  return "";
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-white border border-[#eaeaea] rounded-xl px-4 py-3">
      <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-semibold mt-1 tabular-nums ${tone ?? "text-[#0a0a0a]"}`}>{value}</p>
    </div>
  );
}

export default function InventoryPage() {
  const items = useInventory();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  const counts = useMemo(() => ({
    total: items.reduce((n, i) => n + (i.quantity || 1), 0),
    unused: items.filter(isUnused).reduce((n, i) => n + (i.quantity || 1), 0),
    deployed: items.filter((i) => i.status === "deployed").length,
    sims: items.filter((i) => i.category === "sim").length,
  }), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const matchesSearch =
        !q ||
        [i.name, i.carrier, i.model, i.iccid, i.imei, i.serial, i.phoneNumber, i.plan, i.assignedTo, i.location, i.notes]
          .some((f) => f?.toLowerCase().includes(q));
      const matchesCategory = category === "all" || i.category === category;
      const matchesStatus =
        status === "all" ||
        (status === "unused" ? isUnused(i) : i.status === status);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [items, search, category, status]);

  function openItem(item: InventoryItem | null) {
    setEditing(item);
    setDrawerOpen(true);
  }

  return (
    <div>
      <Header
        title="Inventory"
        subtitle={`${counts.total} unit${counts.total === 1 ? "" : "s"} tracked · ${counts.unused} unused`}
        actions={
          <button
            onClick={() => openItem(null)}
            className="flex items-center gap-2 bg-[#0a0a0a] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#333] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatTile label="Total Units" value={counts.total} />
        <StatTile label="Unused" value={counts.unused} tone="text-[#0070f3]" />
        <StatTile label="Deployed" value={counts.deployed} tone="text-[#17c964]" />
        <StatTile label="SIM Cards" value={counts.sims} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
          <input
            type="text"
            placeholder="Search name, ICCID, IMEI, number, customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-[#eaeaea] rounded-lg pl-9 pr-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:border-[#0070f3] transition-colors"
          />
        </div>
        <div className="w-44">
          <Select value={category} onChange={setCategory} options={categoryOptions} />
        </div>
        <div className="w-40">
          <Select value={status} onChange={setStatus} options={statusOptions} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#eaeaea] rounded-xl overflow-x-auto">
        <table className="w-full min-w-180">
          <thead>
            <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
              {["Item", "Category", "Identifier", "Line", "Status", "Assigned To", "Location", "Qty"].map((h) => (
                <th
                  key={h}
                  className={`text-[10px] font-semibold text-[#999] uppercase tracking-wider px-4 py-3 whitespace-nowrap ${
                    h === "Qty" ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <Boxes className="w-6 h-6 text-[#ddd] mx-auto mb-3" />
                  <p className="text-sm font-medium text-[#0a0a0a] mb-1">
                    {items.length === 0 ? "Nothing in inventory yet" : "No items match your filters"}
                  </p>
                  <p className="text-xs text-[#999]">
                    {items.length === 0
                      ? "Add the spare routers and unassigned SIMs so the stock lives on the DB."
                      : "Try a different search or filter."}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const style = statusStyle[item.status];
                const ident = identifier(item);
                return (
                  <tr
                    key={item.id}
                    onClick={() => openItem(item)}
                    className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#f5f5f5] flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-[#888]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#0a0a0a] truncate">{item.name || "Untitled item"}</p>
                          <p className="text-xs text-[#999] truncate">
                            {[item.carrier, item.model].filter(Boolean).join(" · ") || "-"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#444] whitespace-nowrap">{CATEGORY_LABELS[item.category]}</td>
                    <td className="px-4 py-3">
                      {ident ? (
                        <div>
                          <p className="text-xs font-mono text-[#444]">{ident}</p>
                          <p className="text-[10px] text-[#bbb] uppercase tracking-wider">{identifierLabel(item)}</p>
                        </div>
                      ) : <span className="text-sm text-[#bbb]">-</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666] whitespace-nowrap">{item.phoneNumber || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${style.bg} ${style.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666] max-w-40 truncate">{item.assignedTo || "-"}</td>
                    <td className="px-4 py-3 text-sm text-[#666] max-w-40 truncate">{item.location || "-"}</td>
                    <td className="px-4 py-3 text-sm text-[#444] text-right tabular-nums">{item.quantity || 1}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mounted on open so the form always starts from the row that was clicked. */}
      {drawerOpen && (
        <InventoryItemDrawer
          open
          onClose={() => { setDrawerOpen(false); setEditing(null); }}
          item={editing}
        />
      )}
    </div>
  );
}
