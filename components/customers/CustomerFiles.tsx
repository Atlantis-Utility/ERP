"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Overlay from "@/components/ui/Overlay";
import {
  Upload,
  Loader2,
  Trash2,
  Download,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Play,
  ImageIcon,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCurrentEmployeeId } from "@/lib/hooks/use-current-employee-id";
import { useConfirm } from "@/lib/confirm";
import { useToast } from "@/lib/toast";
import { formatDate, getErrorMessage } from "@/lib/utils";
import {
  useCustomerFiles,
  uploadCustomerFiles,
  updateCustomerFile,
  removeCustomerFile,
  signedUrlFor,
  formatFileSize,
  CUSTOMER_FILE_MAX,
  type CustomerFile,
} from "@/lib/db/customer-files";

/**
 * A customer's own documentation: how their network is put together.
 *
 * Diagrams, rack photos, a walkthrough video, the installer's PDF. The whole
 * point is that somebody who has never been to the site can open this tab
 * and see the shape of it, so the pictures are shown at a size you can
 * actually read rather than as a list of filenames with paperclips.
 *
 * Images and video go in a grid, because that is a thing you look at.
 * Documents go in a list, because that is a thing you open. Each file can be
 * given a name of its own - "Main site, after the fibre cutover" - since a
 * wall of IMG_4821.jpg is the problem this tab exists to replace.
 */
const ACCEPT = "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.vsd,.vsdx,.ppt,.pptx,.zip";

function DocIcon({ mime, name }: { mime: string; name: string }) {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime.includes("sheet") || ["xls", "xlsx", "csv"].includes(ext)) {
    return <FileSpreadsheet className="w-4 h-4 text-[#17c964]" />;
  }
  return <FileText className="w-4 h-4 text-[#0070f3]" />;
}

export default function CustomerFiles({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const { authUser } = useAuth();
  const myEmployeeId = useCurrentEmployeeId();
  const confirm = useConfirm();
  const { success, error: toastError } = useToast();
  const { files, loading, error, reload } = useCustomerFiles(customerId);

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerFile | null>(null);

  const visual = useMemo(() => files.filter((f) => f.kind !== "document"), [files]);
  const documents = useMemo(() => files.filter((f) => f.kind === "document"), [files]);
  const viewingIndex = visual.findIndex((f) => f.id === viewing);
  const current = viewingIndex >= 0 ? visual[viewingIndex] : null;

  // Arrow keys through the gallery, which is what anybody does once a
  // picture is open. Escape is the Overlay's own.
  useEffect(() => {
    if (!current) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const step = e.key === "ArrowRight" ? 1 : -1;
      const next = visual[(viewingIndex + step + visual.length) % visual.length];
      if (next) setViewing(next.id);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, viewingIndex, visual]);

  async function take(list: FileList | File[] | null) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    setBusy({ done: 0, total: picked.length, name: picked[0].name });
    try {
      const actor = myEmployeeId ? { id: myEmployeeId, name: authUser?.displayName ?? "" } : null;
      const { added, failed } = await uploadCustomerFiles(customerId, picked, actor, (done, total, name) =>
        setBusy({ done, total, name }),
      );
      reload();
      if (added.length > 0) {
        success(`Added ${added.length} file${added.length === 1 ? "" : "s"} to ${customerName}.`);
      }
      // Each failure says which file and why, rather than one "some files
      // failed" for a batch where only the 80MB video was the problem.
      for (const line of failed) toastError(line);
    } catch (err) {
      toastError(getErrorMessage(err, "Couldn't upload those files"));
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function download(file: CustomerFile) {
    const url = file.url ?? (await signedUrlFor(file.path));
    if (!url) {
      toastError("Couldn't get a link for that file.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function drop(file: CustomerFile) {
    const ok = await confirm({
      title: "Remove this file?",
      description: `${file.title || file.name} will be deleted from ${customerName}. If it's the only drawing of this site, it isn't recoverable.`,
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await removeCustomerFile(file);
      if (viewing === file.id) setViewing(null);
      reload();
      success("File removed.");
    } catch (err) {
      toastError(getErrorMessage(err, "Couldn't remove that file"));
    }
  }

  const byline = (file: CustomerFile) =>
    [file.uploadedByName, formatDate(file.createdAt)].filter(Boolean).join(" · ");

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        // Only when the pointer has actually left the panel: dragging over a
        // child fires dragleave on the parent, which otherwise flickers.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files);
      }}
      className={`relative px-5 py-5 ${dragging ? "bg-[#f0f7ff]" : ""} transition-colors`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0a0a0a]">Network documentation</p>
          <p className="text-xs text-[#999] mt-0.5">
            Diagrams, rack and site photos, walkthrough videos and documents, so anyone can see how this
            site is put together. Up to {formatFileSize(CUSTOMER_FILE_MAX)} a file.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {busy && (
            <span className="flex items-center gap-1.5 text-xs text-[#666]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="tabular-nums">
                {busy.done}/{busy.total}
              </span>
              <span className="hidden sm:inline max-w-40 truncate text-[#999]">{busy.name}</span>
            </span>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => take(e.target.files)}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={Boolean(busy)}
            className="flex items-center gap-1.5 bg-[#0a0a0a] text-white text-[13px] font-medium px-3.5 py-2 rounded-md hover:bg-[#333] transition-colors disabled:opacity-40"
          >
            <Upload className="w-3.5 h-3.5" /> Upload
          </button>
        </div>
      </div>

      {dragging && (
        <div className="absolute inset-3 border-2 border-dashed border-[#0070f3] rounded-xl pointer-events-none flex items-center justify-center">
          <p className="text-sm font-medium text-[#0070f3] bg-white px-3 py-1.5 rounded-md shadow-sm">
            Drop to add to {customerName}
          </p>
        </div>
      )}

      {error ? (
        <div className="py-10 text-center">
          <p className="text-sm text-[#f31260]">{error}</p>
          <p className="text-xs text-[#999] mt-1">
            If this is new, supabase/migration-customer-files.sql may not have been run yet.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#999]">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : files.length === 0 ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full border border-dashed border-[#eaeaea] rounded-xl py-12 text-center hover:border-[#0070f3] hover:bg-[#fafafa] transition-colors"
        >
          <ImageIcon className="w-8 h-8 text-[#ddd] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#666]">Nothing here yet</p>
          <p className="text-xs text-[#999] mt-1">
            Drop a network diagram in, or click to pick files.
          </p>
        </button>
      ) : (
        <div className="space-y-6">
          {visual.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {visual.map((file) => (
                <figure
                  key={file.id}
                  className="group relative bg-[#fafafa] border border-[#eaeaea] rounded-xl overflow-hidden hover:border-[#d4d4d4] transition-colors"
                >
                  <button
                    onClick={() => setViewing(file.id)}
                    className="block w-full aspect-[4/3] bg-[#f4f4f4] overflow-hidden"
                    title={file.title || file.name}
                  >
                    {file.kind === "image" ? (
                      // object-contain, not cover: a diagram cropped to fill
                      // a tile is a diagram with its edges cut off.
                      <img
                        src={file.url}
                        alt={file.title || file.name}
                        loading="lazy"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center bg-[#0a0a0a]/90 relative">
                        <video src={file.url} preload="metadata" className="absolute inset-0 w-full h-full object-contain" />
                        <span className="relative z-10 w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                          <Play className="w-4 h-4 text-[#0a0a0a] ml-0.5" />
                        </span>
                      </span>
                    )}
                  </button>

                  <figcaption className="px-3 py-2.5 border-t border-[#eaeaea] bg-white">
                    <p className="text-[13px] font-medium text-[#0a0a0a] truncate" title={file.title || file.name}>
                      {file.title || file.name}
                    </p>
                    <p className="text-[11px] text-[#999] truncate">{byline(file)}</p>
                  </figcaption>

                  {/* Kept out of the way until wanted: a grid of pictures
                      covered in buttons is a toolbar, not a gallery. */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconAction label="Rename" onClick={() => setEditing(file)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </IconAction>
                    <IconAction label="Download" onClick={() => download(file)}>
                      <Download className="w-3.5 h-3.5" />
                    </IconAction>
                    <IconAction label="Remove" danger onClick={() => drop(file)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconAction>
                  </div>
                </figure>
              ))}
            </div>
          )}

          {documents.length > 0 && (
            <div>
              {visual.length > 0 && (
                <p className="text-[10px] font-semibold text-[#bbb] uppercase tracking-wider mb-2">Documents</p>
              )}
              <div className="border border-[#eaeaea] rounded-xl overflow-hidden">
                {documents.map((file) => (
                  <div
                    key={file.id}
                    className="group flex items-center gap-3 px-4 py-3 border-b border-[#f4f4f4] last:border-0 hover:bg-[#fafafa] transition-colors"
                  >
                    <DocIcon mime={file.mime} name={file.name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#0a0a0a] truncate">{file.title || file.name}</p>
                      <p className="text-[11px] text-[#999] truncate">
                        {file.title ? `${file.name} · ` : ""}
                        {formatFileSize(file.size)} · {byline(file)}
                      </p>
                      {file.caption && <p className="text-xs text-[#666] mt-0.5">{file.caption}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {file.url && (
                        <IconAction label="Open" href={file.url}>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </IconAction>
                      )}
                      <IconAction label="Rename" onClick={() => setEditing(file)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </IconAction>
                      <IconAction label="Download" onClick={() => download(file)}>
                        <Download className="w-3.5 h-3.5" />
                      </IconAction>
                      <IconAction label="Remove" danger onClick={() => drop(file)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </IconAction>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {current && (
        <Overlay
          onDismiss={() => setViewing(null)}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 sm:p-8"
        >
          <div className="w-full max-w-6xl max-h-full flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4 text-white">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{current.title || current.name}</p>
                <p className="text-xs text-white/60 truncate">
                  {current.title ? `${current.name} · ` : ""}
                  {formatFileSize(current.size)} · {byline(current)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <GhostAction label="Rename" onClick={() => setEditing(current)}>
                  <Pencil className="w-4 h-4" />
                </GhostAction>
                <GhostAction label="Download" onClick={() => download(current)}>
                  <Download className="w-4 h-4" />
                </GhostAction>
                <GhostAction label="Close" onClick={() => setViewing(null)}>
                  <X className="w-4 h-4" />
                </GhostAction>
              </div>
            </div>

            <div className="relative flex-1 min-h-0 flex items-center justify-center">
              {visual.length > 1 && (
                <>
                  <GhostArrow side="left" onClick={() => setViewing(visual[(viewingIndex - 1 + visual.length) % visual.length].id)} />
                  <GhostArrow side="right" onClick={() => setViewing(visual[(viewingIndex + 1) % visual.length].id)} />
                </>
              )}
              {current.kind === "image" ? (
                <img
                  src={current.url}
                  alt={current.title || current.name}
                  className="max-h-[75vh] max-w-full object-contain rounded-lg bg-white"
                />
              ) : (
                <video
                  src={current.url}
                  controls
                  autoPlay
                  className="max-h-[75vh] max-w-full rounded-lg bg-black"
                />
              )}
            </div>

            {current.caption && (
              <p className="text-sm text-white/80 text-center max-w-3xl mx-auto">{current.caption}</p>
            )}
            {visual.length > 1 && (
              <p className="text-xs text-white/50 text-center tabular-nums">
                {viewingIndex + 1} of {visual.length}
              </p>
            )}
          </div>
        </Overlay>
      )}

      {editing && (
        <RenameFileModal
          file={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
            success("Saved.");
          }}
        />
      )}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  href,
  danger,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const className = `p-1.5 rounded-md bg-white/95 border border-[#eaeaea] shadow-sm transition-colors ${
    danger ? "text-[#999] hover:text-[#f31260] hover:bg-[#fff0f3]" : "text-[#666] hover:text-[#0a0a0a] hover:bg-[#f5f5f5]"
  }`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} title={label} aria-label={label} className={className}>
      {children}
    </button>
  );
}

function GhostAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="p-2 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
    >
      {children}
    </button>
  );
}

function GhostArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={`absolute ${side === "left" ? "left-0" : "right-0"} z-10 p-2.5 rounded-full bg-black/40 text-white/80 hover:bg-black/70 hover:text-white transition-colors`}
    >
      {side === "left" ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
    </button>
  );
}

/**
 * Naming a file. The name is the whole value of the tab: "Main site network
 * diagram" is findable and IMG_4821.jpg is not.
 */
function RenameFileModal({
  file,
  onClose,
  onSaved,
}: {
  file: CustomerFile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(file.title);
  const [caption, setCaption] = useState(file.caption);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const inputClass =
    "text-sm border border-[#eaeaea] rounded-lg px-3 py-2 outline-none focus:border-[#0070f3] transition-colors w-full";

  async function save() {
    setSaving(true);
    setError("");
    try {
      await updateCustomerFile(file.id, { title, caption });
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that"));
      setSaving(false);
    }
  }

  return (
    <Overlay
      onDismiss={onClose}
      dismissable={!saving}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
    >
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-[#f0f0f0]">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0a0a0a]">What is this?</p>
            <p className="text-xs text-[#999] truncate">{file.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1.5 rounded-md text-[#999] hover:text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Name</label>
            <input
              autoFocus
              className={`${inputClass} mt-1`}
              placeholder="Main site network diagram"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Notes</label>
            <textarea
              rows={3}
              className={`${inputClass} mt-1 resize-none`}
              placeholder="What it shows, when it was drawn, what has changed since"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#f0f0f0]">
          {error && <p className="text-[12px] text-[#f31260] mr-auto truncate">{error}</p>}
          <button
            onClick={onClose}
            className="text-[13px] font-medium border border-[#eaeaea] bg-white text-[#444] px-3.5 py-2 rounded-md hover:bg-[#fafafa] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 text-[13px] font-medium bg-[#0a0a0a] text-white px-4 py-2 rounded-md hover:bg-[#333] transition-colors disabled:opacity-40"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </Overlay>
  );
}
