import { supabase } from "./supabase/client";

const BUCKET = "project-attachments";

export async function storeFile(id: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(id, file, { upsert: true });
  if (error) throw error;
}

export async function retrieveFile(id: string): Promise<File | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(id);
  if (error) return null;
  return new File([data], id, { type: data.type });
}

export async function removeStoredFile(id: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([id]);
  if (error) throw error;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024)            return `${bytes} B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
