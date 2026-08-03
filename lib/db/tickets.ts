import { supabase } from "../supabase/client";

export type TicketStatus   = "open" | "in-progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketSource   = "email" | "phone" | "web" | "manual";

export interface TicketMeta {
  id: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId?: string;
  assigneeName?: string;
  notes?: string;
  updatedAt: string;
}

export interface ManualTicket {
  id: string;
  ticketNumber: number;
  source: TicketSource;
  subject: string;
  description: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId?: string;
  assigneeName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const META_TABLE   = "tickets";
const MANUAL_TABLE = "manual_tickets";

// ── Email ticket metadata (status/priority/assignee overlay) ─────────────────

export async function upsertTicket(id: string, patch: Partial<Omit<TicketMeta, "id">>): Promise<void> {
  const row = Object.fromEntries(
    Object.entries({
      id,
      status: patch.status,
      priority: patch.priority,
      assignee_id: patch.assigneeId,
      assignee_name: patch.assigneeName,
      notes: patch.notes,
      updated_at: new Date().toISOString(),
    }).filter(([, v]) => v !== undefined)
  );
  const { error } = await supabase.from(META_TABLE).upsert(row);
  if (error) throw error;
}

function metaFromRow(row: Record<string, unknown>): TicketMeta {
  return {
    id: row.id as string,
    status: row.status as TicketStatus,
    priority: row.priority as TicketPriority,
    assigneeId: (row.assignee_id as string) ?? undefined,
    assigneeName: (row.assignee_name as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    updatedAt: row.updated_at as string,
  };
}

export function subscribeAllTicketMeta(cb: (metas: TicketMeta[]) => void): () => void {
  supabase.from(META_TABLE).select("*").then(({ data, error }) => {
    if (error) { console.error("[tickets]", error); return; }
    cb((data ?? []).map(metaFromRow));
  });

  const channel = supabase
    .channel("tickets-all")
    .on("postgres_changes", { event: "*", schema: "public", table: META_TABLE }, () => {
      supabase.from(META_TABLE).select("*").then(({ data, error }) => {
        if (error) { console.error("[tickets]", error); return; }
        cb((data ?? []).map(metaFromRow));
      });
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// ── Manual / multi-channel tickets ──────────────────────────────────────────

async function nextTicketNumber(): Promise<number> {
  const { data, error } = await supabase.rpc("next_ticket_number");
  if (error) throw error;
  return data as number;
}

function manualFromRow(row: Record<string, unknown>): ManualTicket {
  return {
    id: row.id as string,
    ticketNumber: row.ticket_number as number,
    source: row.source as TicketSource,
    subject: row.subject as string,
    description: row.description as string,
    customerName: row.customer_name as string,
    customerEmail: (row.customer_email as string) ?? undefined,
    customerPhone: (row.customer_phone as string) ?? undefined,
    status: row.status as TicketStatus,
    priority: row.priority as TicketPriority,
    assigneeId: (row.assignee_id as string) ?? undefined,
    assigneeName: (row.assignee_name as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function createManualTicket(
  data: Omit<ManualTicket, "id" | "ticketNumber" | "createdAt" | "updatedAt">
): Promise<string> {
  const ticketNumber = await nextTicketNumber();
  const { data: inserted, error } = await supabase
    .from(MANUAL_TABLE)
    .insert({
      ticket_number: ticketNumber,
      source: data.source,
      subject: data.subject,
      description: data.description,
      customer_name: data.customerName,
      customer_email: data.customerEmail,
      customer_phone: data.customerPhone,
      status: data.status,
      priority: data.priority,
      assignee_id: data.assigneeId,
      assignee_name: data.assigneeName,
      notes: data.notes,
    })
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id as string;
}

export async function upsertManualTicket(
  id: string,
  patch: Partial<Omit<ManualTicket, "id" | "ticketNumber" | "createdAt">>
): Promise<void> {
  const row = Object.fromEntries(
    Object.entries({
      subject: patch.subject,
      description: patch.description,
      customer_name: patch.customerName,
      customer_email: patch.customerEmail,
      customer_phone: patch.customerPhone,
      status: patch.status,
      priority: patch.priority,
      assignee_id: patch.assigneeId,
      assignee_name: patch.assigneeName,
      notes: patch.notes,
      updated_at: new Date().toISOString(),
    }).filter(([, v]) => v !== undefined)
  );
  const { error } = await supabase.from(MANUAL_TABLE).update(row).eq("id", id);
  if (error) throw error;
}

export function subscribeManualTickets(cb: (tickets: ManualTicket[]) => void): () => void {
  function load() {
    supabase.from(MANUAL_TABLE).select("*").order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) { console.error("[manual-tickets]", error); return; }
      cb((data ?? []).map(manualFromRow));
    });
  }
  load();

  const channel = supabase
    .channel("manual-tickets-all")
    .on("postgres_changes", { event: "*", schema: "public", table: MANUAL_TABLE }, load)
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
