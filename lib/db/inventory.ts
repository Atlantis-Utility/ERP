"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { subscribeTable } from "../supabase/realtime";

// Equipment and SIM stock — see supabase/migration-inventory.sql. Anything we
// own but aren't currently billing for lives here (spare backup routers,
// unassigned SIMs, gear pulled back off a site), alongside the deployed units
// so a line can be traced from the shelf to the customer it ended up at.
const TABLE = "inventory_items";

export type InventoryCategory =
  | "sim" | "router" | "gateway" | "switch" | "ap" | "phone" | "antenna" | "accessory" | "other";

export type InventoryStatus =
  | "in_stock" | "assigned" | "deployed" | "returned" | "retired";

export interface InventoryItem {
  id: string;
  category: InventoryCategory;
  status: InventoryStatus;
  name: string;            // what it is, in our words: "T-Mobile 5G Backup Router"
  carrier?: string;        // "T-Mobile", "Lytwave", …
  model?: string;          // "Inseego FX3100"
  serial?: string;         // serial number, or MAC for UniFi gear
  imei?: string;           // routers/hotspots
  iccid?: string;          // SIM card number
  phoneNumber?: string;    // the line the SIM carries
  plan?: string;           // rate plan / SKU
  quantity: number;        // >1 only for interchangeable stock (cables, mounts)
  location?: string;       // where it physically is when unassigned
  assignedTo?: string;     // customer or site it's deployed at
  customerId?: string;     // RingLogix domain id, when we know it
  monthlyCost?: number;    // recurring cost to us (a SIM's line charge)
  purchaseCost?: number;   // one-time hardware cost
  activatedOn?: string;    // ISO date (yyyy-mm-dd)
  notes?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  sim: "SIM Card",
  router: "Router",
  gateway: "Gateway",
  switch: "Switch",
  ap: "Access Point",
  phone: "Phone",
  antenna: "Antenna",
  accessory: "Accessory",
  other: "Other",
};

export const STATUS_LABELS: Record<InventoryStatus, string> = {
  in_stock: "In Stock",
  assigned: "Assigned",
  deployed: "Deployed",
  returned: "Returned",
  retired: "Retired",
};

/** Stock that isn't earning anything right now — the reason this table exists. */
export const UNUSED_STATUSES: InventoryStatus[] = ["in_stock", "returned"];

export function isUnused(item: InventoryItem): boolean {
  return UNUSED_STATUSES.includes(item.status);
}

interface Row { id: string; category: InventoryCategory; status: InventoryStatus; data: InventoryItem }

const fromRow = (row: Row): InventoryItem => ({
  ...row.data,
  id: row.id,
  category: row.category,
  status: row.status,
});

const toRow = (item: InventoryItem) => ({
  id: item.id,
  category: item.category,
  status: item.status,
  updated_at: item.updatedAt,
  data: item,
});

async function fetchAll(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, category, status, data")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export function subscribeInventory(cb: (items: InventoryItem[]) => void) {
  return subscribeTable(TABLE, fetchAll, cb);
}

export function useInventory(): InventoryItem[] {
  const [list, setList] = useState<InventoryItem[]>([]);
  useEffect(() => subscribeInventory(setList), []);
  return list;
}

export async function saveInventoryItem(item: InventoryItem): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert(toRow(item));
  if (error) throw error;
}

/** Bulk insert — one round trip when adding a batch of SIMs off an invoice. */
export async function saveInventoryItems(items: InventoryItem[]): Promise<void> {
  if (items.length === 0) return;
  const { error } = await supabase.from(TABLE).upsert(items.map(toRow));
  if (error) throw error;
}

export async function removeInventoryItem(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export function newInventoryItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    category: "other",
    status: "in_stock",
    name: "",
    quantity: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
