"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { subscribeTable } from "../supabase/realtime";

const TABLE = "leads";

export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "converted";
export type LeadSource = "azure_maps" | "linkedin_csv" | "manual";

export interface Lead {
  id: string;
  companyName: string;
  dba?: string; // "Doing Business As", trade name, if different from the legal company name
  businessType?: string;
  pocName?: string;
  pocTitle?: string;
  phone?: string;
  email?: string; // not available from Azure Maps, manual entry only
  website?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number; // from Azure Maps enrichment, drives the embedded map without re-geocoding
  lon?: number;
  location?: string; // raw location text (e.g. from a LinkedIn CSV) before/without a Places match
  companySize?: string; // e.g. "11-50" (LinkedIn doesn't have an export API, so this is filled in by hand)
  linkedinUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  source: LeadSource;
  mapsPlaceId?: string; // dedupe key for Azure Maps-sourced/enriched leads
  status: LeadStatus;
  notes?: string;
  assignedTo?: string; // employee id, for the "My Leads" filter
  assignedToName?: string; // denormalized so the table doesn't need an employees join
  followUpDate?: string; // ISO date (yyyy-mm-dd), drives the overdue indicator
  createdAt: string;
  updatedAt: string;
}

interface Row { id: string; status: LeadStatus; data: Lead }
const fromRow = (row: Row): Lead => ({ ...row.data, id: row.id, status: row.status });

function withTimeout<T>(promise: PromiseLike<T>, ms = 12_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Request timed out. Check your connection and try again.")),
        ms
      )
    ),
  ]);
}

async function fetchAll(): Promise<Lead[]> {
  const { data, error } = await supabase.from(TABLE).select("id, status, data").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export function subscribeLeads(cb: (leads: Lead[]) => void) {
  return subscribeTable(TABLE, fetchAll, cb);
}

export function useLeads(): Lead[] {
  const [list, setList] = useState<Lead[]>([]);
  useEffect(() => subscribeLeads(setList), []);
  return list;
}

export async function addLead(lead: Lead): Promise<void> {
  const { error } = await withTimeout(
    supabase.from(TABLE).upsert({ id: lead.id, status: lead.status, updated_at: lead.updatedAt, data: lead })
  );
  if (error) throw error;
}

// Bulk variant for CSV import: one round trip instead of one per row.
export async function addLeads(leads: Lead[]): Promise<void> {
  if (leads.length === 0) return;
  const { error } = await withTimeout(
    supabase.from(TABLE).upsert(
      leads.map((lead) => ({ id: lead.id, status: lead.status, updated_at: lead.updatedAt, data: lead }))
    )
  );
  if (error) throw error;
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase.from(TABLE).select("data").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const merged: Lead = { ...(existing.data as Lead), ...patch, updatedAt: new Date().toISOString() };
  const { error } = await withTimeout(
    supabase.from(TABLE).update({ status: merged.status, updated_at: merged.updatedAt, data: merged }).eq("id", id)
  );
  if (error) throw error;
}

export async function removeLead(id: string): Promise<void> {
  const { error } = await withTimeout(supabase.from(TABLE).delete().eq("id", id));
  if (error) throw error;
}
