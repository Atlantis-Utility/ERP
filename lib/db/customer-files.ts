"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { subscribeChanges } from "../supabase/realtime";

/**
 * Files kept against a customer: network diagrams, site photos, a walkthrough
 * video, the PDF the installer left behind.
 *
 * Customers have no local row of their own (they come live from RingLogix),
 * so this is keyed by the domain id, the same way customer_profiles and
 * customer_unifi_sites are.
 *
 * The bytes live in a private bucket and the app never holds a URL for
 * longer than it needs one: every read is a signed link with an expiry. That
 * is also what makes a video playable - a signed URL is something the
 * browser can range-request and stream, where downloading the object into a
 * blob means waiting for all of it before anything plays.
 *
 * Requires supabase/migration-customer-files.sql.
 */
const TABLE = "customer_files";
export const BUCKET = "customer-files";

/** What the bucket is configured to accept. See the migration. */
export const CUSTOMER_FILE_MAX = 50 * 1024 * 1024;

/** How long a signed link lasts. Long enough to read a page, not to keep. */
const SIGNED_FOR = 60 * 60 * 2;

export type FileKind = "image" | "video" | "document";

export interface CustomerFile {
  id: string;
  customerId: string;
  path: string;
  name: string;
  /** What it is, as opposed to what the camera called it. */
  title: string;
  caption: string;
  mime: string;
  size: number;
  kind: FileKind;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Filled in by the hook; absent until the link has been signed. */
  url?: string;
}

interface Row {
  id: string;
  customer_id: string;
  path: string;
  name: string;
  title: string | null;
  caption: string | null;
  mime: string;
  size: number;
  kind: FileKind;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const fromRow = (r: Row): CustomerFile => ({
  id: r.id,
  customerId: r.customer_id,
  path: r.path,
  name: r.name,
  title: r.title ?? "",
  caption: r.caption ?? "",
  mime: r.mime,
  size: Number(r.size ?? 0),
  kind: r.kind,
  uploadedBy: r.uploaded_by,
  uploadedByName: r.uploaded_by_name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function withTimeout<T>(promise: PromiseLike<T>, ms = 20_000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("The server is taking longer than expected. Please try again.")), ms),
    ),
  ]);
}

/**
 * Which of the three a file is.
 *
 * The mime type decides it where there is one, because that is what the
 * browser will act on. Some things arrive as application/octet-stream from a
 * phone or a scanner, so the extension gets the last word rather than
 * everything landing in "document".
 */
export function kindOf(mime: string, name: string): FileKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "heic"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v", "avi", "mkv"].includes(ext)) return "video";
  return "document";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * An object key that is safe in a URL and still recognisable in the bucket.
 * The uuid is what keeps two "diagram.png" apart; the name is only there so
 * somebody looking at the storage browser can tell what they are seeing.
 */
function objectKey(customerId: string, name: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${safe(customerId) || "customer"}/${crypto.randomUUID()}-${safe(name) || "file"}`;
}

export async function fetchCustomerFiles(customerId: string): Promise<CustomerFile[]> {
  const { data, error } = await withTimeout(
    supabase
      .from(TABLE)
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(500),
  );
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

/** Signed links for a set of files, keyed by path. */
export async function signUrls(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data, error } = await withTimeout(supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_FOR));
  if (error) throw error;
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

export interface UploadResult {
  added: CustomerFile[];
  /** One line per file that didn't make it, ready to show. */
  failed: string[];
}

/**
 * Puts files on a customer.
 *
 * The object goes up first and the row second, because a row pointing at
 * bytes that aren't there is a broken tile in the gallery, while an object
 * with no row is invisible and costs nothing but space. If the row fails the
 * object is taken back out, so even that doesn't happen in the usual case.
 */
export async function uploadCustomerFiles(
  customerId: string,
  files: File[],
  actor: { id: string; name: string } | null,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<UploadResult> {
  const added: CustomerFile[] = [];
  const failed: string[] = [];

  for (const [index, file] of files.entries()) {
    onProgress?.(index, files.length, file.name);
    if (file.size > CUSTOMER_FILE_MAX) {
      failed.push(`${file.name} is ${formatFileSize(file.size)} - the limit is ${formatFileSize(CUSTOMER_FILE_MAX)}.`);
      continue;
    }
    const path = objectKey(customerId, file.name);
    const mime = file.type || "application/octet-stream";
    try {
      const { error: upErr } = await withTimeout(
        supabase.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false }),
        180_000,
      );
      if (upErr) throw upErr;

      const { data, error } = await withTimeout(
        supabase
          .from(TABLE)
          .insert({
            customer_id: customerId,
            path,
            name: file.name,
            mime,
            size: file.size,
            kind: kindOf(mime, file.name),
            uploaded_by: actor?.id ?? null,
            uploaded_by_name: actor?.name ?? null,
          })
          .select("*")
          .single(),
      );
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      added.push(fromRow(data as Row));
    } catch (err) {
      failed.push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
    }
  }
  onProgress?.(files.length, files.length, "");
  return { added, failed };
}

export async function updateCustomerFile(
  id: string,
  patch: { title?: string; caption?: string },
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title.trim() || null;
  if (patch.caption !== undefined) update.caption = patch.caption.trim() || null;
  const { error } = await withTimeout(supabase.from(TABLE).update(update).eq("id", id));
  if (error) throw error;
}

/**
 * Removes a file. The row goes first: it is what the gallery reads, so once
 * it is gone the file is gone as far as anybody can tell, and a bucket
 * object left behind by a failure here costs space and nothing else.
 *
 * The returned rows are the point of the `.select()`. A delete that the row
 * policy filters out is not an error - it is a delete that matched nothing,
 * and it comes back successful with an empty list. Without this the caller
 * would report "removed", say nothing, and go on to delete the bytes out
 * from under a row it was not allowed to touch.
 */
export async function removeCustomerFile(file: CustomerFile): Promise<void> {
  const { data, error } = await withTimeout(supabase.from(TABLE).delete().eq("id", file.id).select("id"));
  if (error) {
    throw new Error(
      /violates row-level security|permission denied/i.test(error.message)
        ? "Only the person who uploaded this, or an administrator, can remove it."
        : error.message,
    );
  }
  if (!data || (data as unknown[]).length === 0) {
    throw new Error("Only the person who uploaded this, or an administrator, can remove it.");
  }
  await supabase.storage.from(BUCKET).remove([file.path]);
}

/** A link to one file, signed fresh - for a download, or opening in a tab. */
export async function signedUrlFor(path: string): Promise<string | null> {
  const { data, error } = await withTimeout(supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_FOR));
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * What is on file, without the links.
 *
 * The page wants this on every visit - for the count on the tab, and so
 * "export what I'm looking at" has something to export - while the tab
 * itself is usually never opened. Signing a URL per file is the expensive
 * half, so that waits until somebody actually looks.
 */
export function useCustomerFileSummary(customerId: string): { files: CustomerFile[]; loading: boolean } {
  const [state, setState] = useState<{ files: CustomerFile[]; loading: boolean }>({ files: [], loading: true });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const files = await fetchCustomerFiles(customerId);
        if (!cancelled) setState({ files, loading: false });
      } catch {
        // The tab says what went wrong; a count that can't be fetched just
        // isn't shown.
        if (!cancelled) setState({ files: [], loading: false });
      }
    };
    load();
    const unsubscribe = subscribeChanges(`customer-files-${customerId}`, [TABLE], load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [customerId]);

  return state;
}

export interface CustomerFilesState {
  files: CustomerFile[];
  loading: boolean;
  error: string;
  reload: () => void;
}

/**
 * A customer's files, with their links already signed, kept live so a file
 * somebody else adds turns up without a refresh.
 */
export function useCustomerFiles(customerId: string): CustomerFilesState {
  const [state, setState] = useState<Omit<CustomerFilesState, "reload">>({
    files: [],
    loading: true,
    error: "",
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const files = await fetchCustomerFiles(customerId);
        const urls = await signUrls(files.map((f) => f.path));
        if (!cancelled) {
          setState({
            files: files.map((f) => ({ ...f, url: urls.get(f.path) })),
            loading: false,
            error: "",
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            files: [],
            loading: false,
            error: err instanceof Error ? err.message : "Couldn't load this customer's files",
          });
        }
      }
    };
    load();
    const unsubscribe = subscribeChanges(`customer-files-${customerId}`, [TABLE], load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [customerId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
