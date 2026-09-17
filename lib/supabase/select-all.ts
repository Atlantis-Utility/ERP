"use client";

import { supabase } from "./client";

// PostgREST caps an un-paginated select at `db-max-rows` (1000 on Supabase)
// and returns the truncated page with no error, no warning and no flag, a
// full table of 2184 leads comes back as exactly 1000 rows that look
// complete. Every fetchAll() in lib/db does a plain select, so any table
// past the cap silently renders a partial list.
//
// This pages until it has the row count the server reports, rather than
// trusting one request. Page size is only a request, the server may return
// fewer, so the loop advances by however many rows actually arrived instead
// of by a fixed stride, which keeps it correct even if db-max-rows is
// lowered below PAGE.
const PAGE = 1000;

export interface SelectAllOptions {
  /** Column to order by, applied server-side so paging is stable. */
  orderBy?: string;
  ascending?: boolean;
}

export async function selectAll<T>(
  table: string,
  columns: string,
  { orderBy, ascending = false }: SelectAllOptions = {},
): Promise<T[]> {
  const { count, error: countError } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (countError) throw countError;

  const total = count ?? 0;
  if (total === 0) return [];

  const rows: T[] = [];
  // A row inserted or deleted between pages would otherwise let this spin:
  // stop on an empty page, and never ask for more pages than there could be.
  const maxRequests = Math.ceil(total / PAGE) + 2;

  for (let request = 0; rows.length < total && request < maxRequests; request++) {
    let query = supabase.from(table).select(columns);
    // An unordered paged select has no guaranteed row order between
    // requests, so the same row can appear on two pages while another is
    // never returned at all.
    if (orderBy) query = query.order(orderBy, { ascending });
    const { data, error } = await query.range(rows.length, rows.length + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
  }

  return rows;
}
