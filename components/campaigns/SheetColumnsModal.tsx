"use client";

import { useState } from "react";
import Overlay from "@/components/ui/Overlay";
import { X, Loader2, Plus, Trash2, RotateCcw, Eye, EyeOff } from "lucide-react";
import { setCampaignMeta, type Campaign, type ExtraColumn, type PaletteColor } from "@/lib/db/campaigns";
import { SHEET_COLUMNS, ALWAYS_SHOWN, SWATCHES } from "@/lib/campaign-constants";
import { getErrorMessage } from "@/lib/utils";
import { useToast } from "@/lib/toast";

/**
 * What this campaign's sheet is called and what its columns are.
 *
 * Open to anyone the campaign was shared with as an editor, not just an
 * administrator: the people working a list are the ones who know that their
 * sheet has a "Source" column and that they call the contact the decision
 * maker. The database agrees — campaign_set_meta checks the grant rather
 * than the table policy.
 *
 * Renaming is a label, not a rename of the underlying field: the Phone
 * column still holds the lead's phone number whatever the heading says. A
 * column the campaign adds is free text stored on the row, so it can hold
 * whatever the spreadsheet it came from held.
 */
export default function SheetColumnsModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? "");
  const [labels, setLabels] = useState<Record<string, string>>(campaign.columns.labels ?? {});
  const [extra, setExtra] = useState<ExtraColumn[]>(campaign.columns.extra ?? []);
  const [hidden, setHidden] = useState<Set<string>>(
    new Set((campaign.columns.hidden ?? []).filter((k) => !ALWAYS_SHOWN.has(k))),
  );
  const [colors, setColors] = useState<PaletteColor[]>(campaign.columns.palette ?? []);
  const [saving, setSaving] = useState(false);
  const { success, error: toastError } = useToast();

  const renamedCount = SHEET_COLUMNS.filter((c) => (labels[c.key] ?? "").trim()).length;

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addColor() {
    // The next swatch nobody has taken, so two colours don't start the same.
    const taken = new Set(colors.map((c) => c.swatch));
    const swatch = (SWATCHES.find((s) => !taken.has(s.id)) ?? SWATCHES[0]).id;
    setColors((prev) => [...prev, { id: `k${Date.now().toString(36)}`, name: "", swatch }]);
  }

  function addColumn() {
    // Keyed by when it was made, because row values are stored against this
    // id: renaming the column later must not orphan what people typed.
    setExtra((prev) => [...prev, { id: `c${Date.now().toString(36)}`, label: "" }]);
  }

  async function save() {
    if (!name.trim()) {
      toastError("A campaign needs a name.");
      return;
    }
    setSaving(true);
    try {
      const keptLabels: Record<string, string> = {};
      for (const [key, value] of Object.entries(labels)) {
        if (value.trim()) keptLabels[key] = value.trim();
      }
      // A column with no heading is one somebody added and thought better
      // of, so it is dropped rather than saved as a blank heading.
      const keptExtra = extra.filter((c) => c.label.trim()).map((c) => ({ id: c.id, label: c.label.trim() }));
      // A colour nobody named means nothing on the sheet, so it isn't kept.
      const keptColors = colors.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim() }));
      await setCampaignMeta(campaign.id, {
        name: name.trim(),
        description: description.trim(),
        columns: { labels: keptLabels, extra: keptExtra, hidden: [...hidden], palette: keptColors },
      });
      success("Sheet updated.");
      onSaved();
      onClose();
    } catch (err) {
      toastError(getErrorMessage(err, "Failed to save the sheet"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay onDismiss={onClose} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[#0a0a0a] tracking-tight">Sheet &amp; columns</h2>
            <p className="text-[12px] text-[#999] mt-1">
              Rename this campaign, rename a heading, or add a column of your own.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1.5 rounded-md text-[#bbb] hover:text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-4 overflow-y-auto">
          <label className="block text-[11px] font-semibold text-[#999] uppercase tracking-wider mb-1.5">
            Campaign name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-[#eaeaea] rounded-md px-3 py-2 text-sm text-[#0a0a0a] outline-none focus:border-[#0070f3] transition-colors"
          />
          <label className="block text-[11px] font-semibold text-[#999] uppercase tracking-wider mt-4 mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What this list is, and who it's for"
            className="w-full border border-[#eaeaea] rounded-md px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#bbb] outline-none focus:border-[#0070f3] transition-colors resize-none"
          />

          <div className="flex items-center justify-between mt-6 mb-2">
            <p className="text-[11px] font-semibold text-[#999] uppercase tracking-wider">Colours</p>
            <button
              onClick={addColor}
              disabled={colors.length >= SWATCHES.length}
              className="flex items-center gap-1 text-[12px] font-medium text-[#0070f3] hover:underline disabled:text-[#ccc] disabled:no-underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add colour
            </button>
          </div>
          {colors.length === 0 ? (
            <p className="text-[12px] text-[#bbb] border border-dashed border-[#eaeaea] rounded-md px-3 py-3">
              None yet. Name a colour and it becomes something you can paint a row or a cell with —
              right-click any cell on the sheet — and it appears in the legend above the sheet.
            </p>
          ) : (
            <div className="space-y-2">
              {colors.map((color, i) => (
                <div key={color.id} className="flex items-center gap-2">
                  <div className="flex items-center gap-1 shrink-0">
                    {SWATCHES.map((swatch) => (
                      <button
                        key={swatch.id}
                        onClick={() =>
                          setColors((prev) => prev.map((c) => (c.id === color.id ? { ...c, swatch: swatch.id } : c)))
                        }
                        aria-label={swatch.label}
                        title={swatch.label}
                        className={`w-4 h-4 rounded-full ${swatch.dot} transition-transform ${
                          color.swatch === swatch.id ? "ring-2 ring-offset-1 ring-[#0a0a0a] scale-110" : "hover:scale-110"
                        }`}
                      />
                    ))}
                  </div>
                  <input
                    value={color.name}
                    autoFocus={i === colors.length - 1 && color.name === ""}
                    onChange={(e) =>
                      setColors((prev) => prev.map((c) => (c.id === color.id ? { ...c, name: e.target.value } : c)))
                    }
                    placeholder="What it means, e.g. Call back today"
                    className="flex-1 min-w-0 border border-[#eaeaea] rounded-md px-3 py-1.5 text-sm text-[#0a0a0a] placeholder:text-[#bbb] outline-none focus:border-[#0070f3] transition-colors"
                  />
                  <button
                    onClick={() => setColors((prev) => prev.filter((c) => c.id !== color.id))}
                    className="p-1.5 rounded-md text-[#bbb] hover:text-[#f31260] hover:bg-[#fff0f3] transition-colors"
                    aria-label={`Remove ${color.name || "this colour"}`}
                    title="Remove this colour"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-6 mb-2">
            <p className="text-[11px] font-semibold text-[#999] uppercase tracking-wider">Your own columns</p>
            <button
              onClick={addColumn}
              className="flex items-center gap-1 text-[12px] font-medium text-[#0070f3] hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add column
            </button>
          </div>
          {extra.length === 0 ? (
            <p className="text-[12px] text-[#bbb] border border-dashed border-[#eaeaea] rounded-md px-3 py-3">
              None yet. A column you add holds whatever you type in it, row by row — the kind of thing a
              spreadsheet had and the call sheet doesn&apos;t.
            </p>
          ) : (
            <div className="space-y-2">
              {extra.map((col, i) => (
                <div key={col.id} className="flex items-center gap-2">
                  <input
                    value={col.label}
                    autoFocus={i === extra.length - 1 && col.label === ""}
                    onChange={(e) =>
                      setExtra((prev) => prev.map((c) => (c.id === col.id ? { ...c, label: e.target.value } : c)))
                    }
                    placeholder="Column heading"
                    className="flex-1 border border-[#eaeaea] rounded-md px-3 py-1.5 text-sm text-[#0a0a0a] placeholder:text-[#bbb] outline-none focus:border-[#0070f3] transition-colors"
                  />
                  <button
                    onClick={() => setExtra((prev) => prev.filter((c) => c.id !== col.id))}
                    className="p-1.5 rounded-md text-[#bbb] hover:text-[#f31260] hover:bg-[#fff0f3] transition-colors"
                    aria-label={`Remove ${col.label || "this column"}`}
                    title="Remove this column"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] font-semibold text-[#999] uppercase tracking-wider mt-6 mb-1">
            Headings{" "}
            {renamedCount > 0 && <span className="text-[#0070f3] normal-case">· {renamedCount} renamed</span>}
            {hidden.size > 0 && <span className="text-[#999] normal-case">· {hidden.size} hidden</span>}
          </p>
          <p className="text-[11px] text-[#bbb] mb-2">
            Type a heading to rename it, or hide a column this campaign doesn&apos;t use. Hiding keeps
            whatever is stored in it.
          </p>
          <div className="space-y-1.5">
            {SHEET_COLUMNS.map((col) => {
              const renamed = (labels[col.key] ?? "").trim();
              const off = hidden.has(col.key);
              const pinned = ALWAYS_SHOWN.has(col.key);
              return (
                <div key={col.key} className={`flex items-center gap-2 ${off ? "opacity-45" : ""}`}>
                  <span className="w-32 shrink-0 text-[12px] text-[#666] truncate" title={col.label}>
                    {col.label}
                  </span>
                  <input
                    value={labels[col.key] ?? ""}
                    onChange={(e) => setLabels((prev) => ({ ...prev, [col.key]: e.target.value }))}
                    placeholder={col.label}
                    disabled={off}
                    className="flex-1 min-w-0 border border-[#eaeaea] rounded-md px-3 py-1.5 text-sm text-[#0a0a0a] placeholder:text-[#ccc] outline-none focus:border-[#0070f3] transition-colors disabled:bg-[#fafafa]"
                  />
                  <button
                    onClick={() => setLabels((prev) => ({ ...prev, [col.key]: "" }))}
                    disabled={!renamed || off}
                    className="p-1.5 rounded-md text-[#bbb] hover:text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors disabled:opacity-30"
                    aria-label={`Reset ${col.label}`}
                    title="Back to the original heading"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  {/* The frozen pane stays: a sheet of unlabelled rows is no
                      use to anyone. */}
                  <button
                    onClick={() => toggle(col.key)}
                    disabled={pinned}
                    className="p-1.5 rounded-md text-[#bbb] hover:text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors disabled:opacity-20"
                    aria-label={off ? `Show ${col.label}` : `Hide ${col.label}`}
                    title={pinned ? "This one always shows" : off ? "Show this column" : "Hide this column"}
                  >
                    {off ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#f4f4f4] shrink-0">
          <button
            onClick={onClose}
            className="text-[13px] font-medium text-[#666] px-3 py-2 rounded-md hover:bg-[#f5f5f5] transition-colors"
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
