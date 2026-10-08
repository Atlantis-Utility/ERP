"use client";

import { useEffect, useMemo, useState } from "react";
import Overlay from "@/components/ui/Overlay";
import { X, Loader2 } from "lucide-react";
import LeadCriteriaFields from "@/components/campaigns/LeadCriteriaFields";
import {
  addLeadsToCampaign,
  addNewLeadToSheet,
  previewSelection,
  EMPTY_CRITERIA,
  type CampaignCriteria,
  type NewSheetLead,
} from "@/lib/db/campaigns";
import { getErrorMessage } from "@/lib/utils";

/**
 * Two ways onto a sheet.
 *
 * By criteria, out of the leads the database already holds: the preview
 * separates "matches" from "already on this sheet", because the second time
 * you widen a filter most of the matches are usually rows you already have.
 *
 * Or by typing one in. Everything here used to assume the lead existed
 * already, which left a caller who was just given a name and a number on a
 * call with nowhere to put it - the sheet is where they are working, so it
 * is where the lead goes in. Only the company name is required: the rest
 * is whatever they got, and the row is editable afterwards like any other.
 */
type Mode = "database" | "new";

const EMPTY_LEAD: NewSheetLead = { companyName: "" };

const inputClass =
  "text-sm border border-[#eaeaea] rounded-lg px-3 py-2 outline-none focus:border-[#0070f3] transition-colors w-full";
const labelClass = "text-[10px] font-semibold text-[#999] uppercase tracking-wider";

export default function AddLeadsToSheetModal({
  campaignId,
  campaignName,
  selfEmployeeId,
  selfName,
  onClose,
  onAdded,
}: {
  campaignId: string;
  campaignName: string;
  /** Who the typed-in lead belongs to. See addNewLeadToSheet. */
  selfEmployeeId: string;
  selfName: string;
  onClose: () => void;
  onAdded: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("database");
  const [draft, setDraft] = useState<NewSheetLead>(EMPTY_LEAD);
  const [criteria, setCriteria] = useState<CampaignCriteria>(EMPTY_CRITERIA);
  // Tagged with the criteria it was counted for, so "counting…" is derived
  // rather than a second piece of state to keep in step.
  const [preview, setPreview] = useState<{
    key: string;
    matching: number;
    alreadyAdded: number;
    failed: boolean;
  } | null>(null);
  const [limitAll, setLimitAll] = useState(true);
  const [howMany, setHowMany] = useState("500");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const criteriaKey = useMemo(() => JSON.stringify(criteria), [criteria]);
  const previewing = preview?.key !== criteriaKey;

  useEffect(() => {
    const timer = setTimeout(() => {
      previewSelection(criteria, campaignId)
        .then((result) => setPreview({ key: criteriaKey, ...result, failed: false }))
        .catch(() => setPreview({ key: criteriaKey, matching: 0, alreadyAdded: 0, failed: true }));
    }, 350);
    return () => clearTimeout(timer);
  }, [criteria, criteriaKey, campaignId]);

  const willAdd = preview && !preview.failed ? preview.matching - preview.alreadyAdded : null;

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const added = await addLeadsToCampaign(campaignId, {
        kind: "criteria",
        criteria,
        limit: limitAll ? undefined : Number(howMany) || undefined,
      });
      onAdded(
        added === 0
          ? "Nothing to add. Every matching lead is already on this sheet."
          : `Added ${added.toLocaleString()} lead${added !== 1 ? "s" : ""} to ${campaignName}.`,
      );
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to add leads"));
      setSaving(false);
    }
  }

  async function addTyped() {
    if (!draft.companyName.trim()) {
      setError("A company name is the one thing a row needs.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await addNewLeadToSheet(campaignId, draft, { id: selfEmployeeId, name: selfName });
      onAdded(`Added ${draft.companyName.trim()} to ${campaignName}.`);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't add that lead"));
      setSaving(false);
    }
  }

  const field = (
    key: keyof NewSheetLead,
    label: string,
    extra?: { placeholder?: string; type?: string },
  ) => (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        className={`${inputClass} mt-1`}
        type={extra?.type ?? "text"}
        placeholder={extra?.placeholder}
        value={draft[key] ?? ""}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <Overlay onDismiss={onClose} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      dismissable={!saving}>
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[#f0f0f0]">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#0a0a0a] tracking-tight">Add leads</h2>
            <p className="text-[13px] text-[#999] mt-0.5 truncate">to {campaignName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1.5 rounded-md text-[#999] hover:text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Which of the two, chosen before anything is typed: the sheet is
            the same, where the lead comes from is not. */}
        <div className="flex items-center gap-1 px-6 pt-4">
          {([
            ["database", "From the database"],
            ["new", "Type a new one"],
          ] as [Mode, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setMode(value);
                setError("");
              }}
              className={`text-[13px] font-medium px-3 py-1.5 rounded-md border transition-colors ${
                mode === value
                  ? "border-[#0a0a0a] bg-[#fafafa] text-[#0a0a0a]"
                  : "border-transparent text-[#999] hover:bg-[#fafafa]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "new" ? (
          <div className="px-6 py-5 space-y-3 overflow-y-auto flex-1">
            <div>
              <label className={labelClass}>Company *</label>
              <input
                autoFocus
                className={`${inputClass} mt-1`}
                value={draft.companyName}
                onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field("pocName", "Contact")}
              {field("pocTitle", "Title", { placeholder: "Owner, GM…" })}
              {field("phone", "Phone", { type: "tel" })}
              {field("email", "Email", { type: "email" })}
              {field("city", "City")}
              {field("state", "State")}
              {field("website", "Website", { placeholder: "acmeplumbing.com" })}
              {field("businessType", "Business type", { placeholder: "Plumbing, Dental…" })}
            </div>
            <div>
              <label className={labelClass}>What they do, or why they&apos;re a lead</label>
              <textarea
                rows={2}
                className={`${inputClass} mt-1 resize-none`}
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Notes for this sheet</label>
              <textarea
                rows={2}
                className={`${inputClass} mt-1 resize-none`}
                placeholder="Where it came from, when to call, who to ask for"
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
            {/* Said once here rather than discovered later: the lead is
                real, not a line on this sheet only. */}
            <p className="text-[12px] text-[#999] border-t border-[#f0f0f0] pt-3">
              This creates the lead as well as the row, owned by you, and the rest of the row is yours to fill
              in on the sheet.
            </p>
          </div>
        ) : (
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <LeadCriteriaFields criteria={criteria} onChange={setCriteria} onError={setError} />

          {/* Same "how many" choice as creating a campaign: taking the first
              200 of a 7,000-lead city is a normal way to work through one. */}
          <div className="border-t border-[#f0f0f0] pt-4">
            <label className="text-[11px] font-medium text-[#666]">How many leads</label>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <button
                onClick={() => setLimitAll(true)}
                className={`text-[13px] font-medium px-3 py-2 rounded-md border transition-colors ${
                  limitAll
                    ? "border-[#0a0a0a] bg-[#fafafa] text-[#0a0a0a]"
                    : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
                }`}
              >
                All matching
                {willAdd !== null && (
                  <span className="text-[#999] ml-1.5 tabular-nums">{willAdd.toLocaleString()}</span>
                )}
              </button>
              <button
                onClick={() => setLimitAll(false)}
                className={`text-[13px] font-medium px-3 py-2 rounded-md border transition-colors ${
                  !limitAll
                    ? "border-[#0a0a0a] bg-[#fafafa] text-[#0a0a0a]"
                    : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
                }`}
              >
                Just the first
              </button>
              {!limitAll && (
                <>
                  <input
                    value={howMany}
                    onChange={(e) => setHowMany(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    aria-label="How many leads"
                    className="w-24 text-sm border border-[#eaeaea] rounded-md px-2.5 py-2 outline-none focus:border-[#0070f3] transition-colors tabular-nums"
                  />
                  <span className="text-[12px] text-[#999]">by company name, A–Z</span>
                </>
              )}
            </div>
          </div>
        </div>
        )}

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#f0f0f0]">
          <p className="text-[12px] text-[#999] tabular-nums min-w-0 truncate">
            {mode === "new" ? (
              "One row, and one new lead"
            ) : previewing ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Counting…
              </span>
            ) : preview?.failed ? (
              "Couldn't count the matches."
            ) : preview === null ? (
              "-"
            ) : (
              <>
                {(willAdd ?? 0).toLocaleString()} to add
                {preview.alreadyAdded > 0 && (
                  <span className="text-[#bbb]"> · {preview.alreadyAdded.toLocaleString()} already here</span>
                )}
              </>
            )}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {error && (
              <p className="text-[12px] text-[#f31260] max-w-56 truncate" title={error}>
                {error}
              </p>
            )}
            <button
              onClick={onClose}
              className="text-[13px] font-medium border border-[#eaeaea] bg-white text-[#444] px-3.5 py-2 rounded-md hover:bg-[#fafafa] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={mode === "new" ? addTyped : submit}
              disabled={saving || (mode === "new" ? !draft.companyName.trim() : !willAdd)}
              className="flex items-center gap-1.5 text-[13px] font-medium bg-[#0a0a0a] text-white px-4 py-2 rounded-md hover:bg-[#333] transition-colors disabled:opacity-40"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {mode === "new" ? "Add to sheet" : "Add leads"}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
