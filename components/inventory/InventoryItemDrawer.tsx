"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import Drawer from "@/components/ui/Drawer";
import FormField, { inputClass } from "@/components/ui/FormField";
import Select from "@/components/ui/Select";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import {
  saveInventoryItem, removeInventoryItem, newInventoryItem,
  CATEGORY_LABELS, STATUS_LABELS,
  type InventoryItem, type InventoryCategory, type InventoryStatus,
} from "@/lib/db/inventory";

// Mounted only while open (see the inventory page), so the draft starts from
// `item` on every open instead of being resynced by an effect.
interface Props {
  open: boolean;
  onClose: () => void;
  /** null = adding a new item. */
  item: InventoryItem | null;
}

const categoryOptions = (Object.keys(CATEGORY_LABELS) as InventoryCategory[])
  .map((v) => ({ value: v, label: CATEGORY_LABELS[v] }));

const statusOptions = (Object.keys(STATUS_LABELS) as InventoryStatus[])
  .map((v) => ({ value: v, label: STATUS_LABELS[v] }));

// Blank string → undefined, so an emptied field doesn't persist as "".
function trimmed(v: string): string | undefined {
  const t = v.trim();
  return t ? t : undefined;
}

function money(v: string): number | undefined {
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  return v.trim() && !Number.isNaN(n) ? n : undefined;
}

export default function InventoryItemDrawer({ open, onClose, item }: Props) {
  const { authUser } = useAuth();
  const [draft, setDraft] = useState<InventoryItem>(() => item ?? newInventoryItem());
  const [monthlyCost, setMonthlyCost] = useState(() => (item?.monthlyCost != null ? String(item.monthlyCost) : ""));
  const [purchaseCost, setPurchaseCost] = useState(() => (item?.purchaseCost != null ? String(item.purchaseCost) : ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof InventoryItem>(key: K, value: InventoryItem[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const isSim = draft.category === "sim";

  async function handleSave() {
    if (!draft.name.trim()) { setError("Give the item a name."); return; }
    setSaving(true);
    setError("");
    try {
      await saveInventoryItem({
        ...draft,
        name: draft.name.trim(),
        carrier: trimmed(draft.carrier ?? ""),
        model: trimmed(draft.model ?? ""),
        serial: trimmed(draft.serial ?? ""),
        imei: trimmed(draft.imei ?? ""),
        iccid: trimmed(draft.iccid ?? ""),
        phoneNumber: trimmed(draft.phoneNumber ?? ""),
        plan: trimmed(draft.plan ?? ""),
        location: trimmed(draft.location ?? ""),
        assignedTo: trimmed(draft.assignedTo ?? ""),
        notes: trimmed(draft.notes ?? ""),
        monthlyCost: money(monthlyCost),
        purchaseCost: money(purchaseCost),
        quantity: Math.max(1, Number(draft.quantity) || 1),
        updatedAt: new Date().toISOString(),
        updatedBy: authUser?.email ?? undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await removeInventoryItem(draft.id);
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={item ? "Edit Item" : "Add Inventory Item"}
        subtitle={item ? draft.name || "Untitled item" : "Hardware or SIM we hold"}
        width="lg"
        footer={
          <>
            {item && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="mr-auto flex items-center gap-1.5 text-sm font-medium text-[#999] hover:text-[#dc2626] transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
            <button
              onClick={onClose}
              className="border border-[#eaeaea] bg-white text-sm font-medium text-[#444] px-4 py-2 rounded-lg hover:bg-[#fafafa] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#0a0a0a] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-[#fef2f2] border border-[#fecaca]">
              <p className="text-xs text-[#dc2626]">{error}</p>
            </div>
          )}

          <FormField label="Name" required>
            <input
              className={inputClass}
              placeholder="e.g. T-Mobile 5G Backup Router"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category">
              <Select
                value={draft.category}
                onChange={(v) => set("category", v as InventoryCategory)}
                options={categoryOptions}
              />
            </FormField>
            <FormField label="Status" hint="In Stock and Returned count as unused.">
              <Select
                value={draft.status}
                onChange={(v) => set("status", v as InventoryStatus)}
                options={statusOptions}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Carrier / Provider">
              <input
                className={inputClass}
                placeholder="e.g. T-Mobile"
                value={draft.carrier ?? ""}
                onChange={(e) => set("carrier", e.target.value)}
              />
            </FormField>
            <FormField label="Model">
              <input
                className={inputClass}
                placeholder="e.g. Inseego FX3100"
                value={draft.model ?? ""}
                onChange={(e) => set("model", e.target.value)}
              />
            </FormField>
          </div>

          <div className="border-t border-[#f7f7f7] pt-4">
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">
              {isSim ? "SIM Details" : "Identifiers"}
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="ICCID" hint={isSim ? "The number printed on the SIM." : undefined}>
                  <input
                    className={inputClass}
                    placeholder="8901…"
                    value={draft.iccid ?? ""}
                    onChange={(e) => set("iccid", e.target.value)}
                  />
                </FormField>
                <FormField label="Phone Number">
                  <input
                    className={inputClass}
                    placeholder="(805) 555-0142"
                    value={draft.phoneNumber ?? ""}
                    onChange={(e) => set("phoneNumber", e.target.value)}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="IMEI">
                  <input
                    className={inputClass}
                    placeholder="Router / hotspot IMEI"
                    value={draft.imei ?? ""}
                    onChange={(e) => set("imei", e.target.value)}
                  />
                </FormField>
                <FormField label="Serial / MAC">
                  <input
                    className={inputClass}
                    placeholder="Serial number or MAC"
                    value={draft.serial ?? ""}
                    onChange={(e) => set("serial", e.target.value)}
                  />
                </FormField>
              </div>
              <FormField label="Rate Plan">
                <input
                  className={inputClass}
                  placeholder="e.g. T-Mobile Business Internet Backup"
                  value={draft.plan ?? ""}
                  onChange={(e) => set("plan", e.target.value)}
                />
              </FormField>
            </div>
          </div>

          <div className="border-t border-[#f7f7f7] pt-4">
            <p className="text-[10px] font-semibold text-[#999] uppercase tracking-widest mb-3">Placement</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Assigned To" hint="Customer or site, once it leaves the shelf.">
                  <input
                    className={inputClass}
                    placeholder="Customer or site"
                    value={draft.assignedTo ?? ""}
                    onChange={(e) => set("assignedTo", e.target.value)}
                  />
                </FormField>
                <FormField label="Location">
                  <input
                    className={inputClass}
                    placeholder="e.g. Warehouse — Donlon Unit 14"
                    value={draft.location ?? ""}
                    onChange={(e) => set("location", e.target.value)}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField label="Quantity">
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={draft.quantity}
                    onChange={(e) => set("quantity", Number(e.target.value))}
                  />
                </FormField>
                <FormField label="Monthly Cost">
                  <input
                    className={inputClass}
                    placeholder="0.00"
                    value={monthlyCost}
                    onChange={(e) => setMonthlyCost(e.target.value)}
                  />
                </FormField>
                <FormField label="Purchase Cost">
                  <input
                    className={inputClass}
                    placeholder="0.00"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(e.target.value)}
                  />
                </FormField>
              </div>
              <FormField label="Activated On">
                <input
                  type="date"
                  className={inputClass}
                  value={draft.activatedOn ?? ""}
                  onChange={(e) => set("activatedOn", e.target.value)}
                />
              </FormField>
            </div>
          </div>

          <div className="border-t border-[#f7f7f7] pt-4">
            <FormField label="Notes">
              <textarea
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="Anything worth remembering about this unit"
                value={draft.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </FormField>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete item?"
        description={`"${draft.name || "This item"}" will be removed from inventory. This can't be undone.`}
        confirmLabel="Delete"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
