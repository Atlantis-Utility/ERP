"use client";

import { useEffect, useMemo, useState } from "react";
import Overlay from "@/components/ui/Overlay";
import { X, Loader2, Check, Filter, FileSpreadsheet, Circle } from "lucide-react";
import LeadCriteriaFields from "@/components/campaigns/LeadCriteriaFields";
import ImportLeadsCsvModal from "@/components/leads/ImportLeadsCsvModal";
import {
  createCampaign,
  addLeadsToCampaign,
  previewSelection,
  deleteCampaign,
  EMPTY_CRITERIA,
  type CampaignCriteria,
} from "@/lib/db/campaigns";
import { getErrorMessage } from "@/lib/utils";

type Mode = "criteria" | "csv" | "empty";

const inputClass =
  "w-full text-sm border border-[#eaeaea] rounded-md px-3 py-2 outline-none focus:border-[#0070f3] transition-colors";
const labelClass = "text-[11px] font-medium text-[#666]";
const requiredMark = <span className="text-[#f31260]">*</span>;

/**
 * Creates a campaign, optionally filling it in the same step.
 *
 * Three ways in, because all three are real: describe the slice you want and
 * have it filled now, upload a file of leads for it, or start empty and add
 * leads later from the Leads tab.
 */
export default function CreateCampaignModal({
  actor,
  onClose,
  onCreated,
}: {
  actor: { id: string; name: string } | null;
  onClose: () => void;
  onCreated: (campaignId: string, message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("criteria");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState<CampaignCriteria>(EMPTY_CRITERIA);
  const [limitAll, setLimitAll] = useState(true);
  const [howMany, setHowMany] = useState("500");
  const [touched, setTouched] = useState(false);

  // Tagged with the criteria it was counted for, so "counting…" is derived
  // from "the answer on screen is for an older filter set" rather than being
  // a second piece of state to keep in step.
  const [preview, setPreview] = useState<{ key: string; matching: number; failed: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Set once the campaign row exists and the CSV step is running against it.
  const [csvCampaign, setCsvCampaign] = useState<{ id: string; name: string } | null>(null);

  const criteriaKey = useMemo(() => JSON.stringify(criteria), [criteria]);
  const previewing = mode === "criteria" && preview?.key !== criteriaKey;

  // Debounced so dragging through dropdowns doesn't fire a count per change.
  useEffect(() => {
    if (mode !== "criteria") return;
    const timer = setTimeout(() => {
      previewSelection(criteria)
        .then((result) => setPreview({ key: criteriaKey, matching: result.matching, failed: false }))
        .catch(() => setPreview({ key: criteriaKey, matching: 0, failed: true }));
    }, 350);
    return () => clearTimeout(timer);
  }, [criteria, criteriaKey, mode]);

  const activeCriteria = useMemo(() => JSON.stringify(criteria) !== JSON.stringify(EMPTY_CRITERIA), [criteria]);

  const matching = preview && !preview.failed ? preview.matching : null;
  const requested = Number(howMany) || 0;
  const willAdd = matching === null ? null : limitAll ? matching : Math.min(matching, requested);

  const nameMissing = !name.trim();
  const showNameError = touched && nameMissing;

  async function submit() {
    setTouched(true);
    if (nameMissing) {
      setError("Give the campaign a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = await createCampaign({
        name,
        description,
        createdBy: actor?.id ?? null,
        createdByName: actor?.name ?? null,
      });

      if (mode === "empty") {
        onCreated(id, `Campaign "${name.trim()}" created. Add leads from the Leads tab, or open it to fill it in.`);
        return;
      }

      if (mode === "csv") {
        // The campaign has to exist before the import can be attached to it,
        // so the file step runs against a real row. If it's abandoned the
        // empty campaign is cleaned up rather than left behind.
        setCsvCampaign({ id, name: name.trim() });
        setSaving(false);
        return;
      }

      const added = await addLeadsToCampaign(id, {
        kind: "criteria",
        criteria,
        limit: limitAll ? undefined : requested || undefined,
      });
      onCreated(
        id,
        added === 0
          ? `Campaign "${name.trim()}" created, but no leads matched those filters.`
          : `Campaign "${name.trim()}" created with ${added.toLocaleString()} lead${added !== 1 ? "s" : ""}.`,
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create the campaign"));
      setSaving(false);
    }
  }

  /** The CSV step finished: put exactly those leads on the new campaign. */
  async function attachImported(count: number, leadIds: string[]) {
    if (!csvCampaign) return;
    try {
      const added = await addLeadsToCampaign(csvCampaign.id, { kind: "ids", ids: leadIds });
      onCreated(
        csvCampaign.id,
        `Campaign "${csvCampaign.name}" created with ${added.toLocaleString()} of ${count.toLocaleString()} imported lead${count !== 1 ? "s" : ""}.`,
      );
    } catch (err) {
      // The leads did import, they're on the Leads tab either way, so say
      // what actually happened rather than implying the file was lost.
      setCsvCampaign(null);
      setError(
        getErrorMessage(
          err,
          "The leads imported, but adding them to the campaign failed. Add them from the Leads tab.",
        ),
      );
    }
  }

  /** Abandoning the file step shouldn't leave an empty campaign behind. */
  async function cancelCsvStep() {
    const created = csvCampaign;
    setCsvCampaign(null);
    if (!created) return;
    try {
      await deleteCampaign(created.id);
    } catch {
      // Not worth interrupting anyone over: the campaign is simply empty,
      // and deleting it is a click on the list.
    }
  }

  // While the CSV step is open it replaces this dialog, rather than stacking
  // two modals on top of each other.
  if (csvCampaign) {
    return (
      <ImportLeadsCsvModal
        actor={actor}
        submitLabel={`Import & add to ${csvCampaign.name}`}
        onImported={attachImported}
        onClose={cancelCsvStep}
      />
    );
  }

  return (
    <Overlay onDismiss={onClose} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      dismissable={!saving}>
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[#f0f0f0]">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#0a0a0a] tracking-tight">New campaign</h2>
            <p className="text-[13px] text-[#999] mt-0.5">A list of leads to work through as a call sheet.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1.5 rounded-md text-[#999] hover:text-[#0a0a0a] hover:bg-[#f5f5f5] transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Name {requiredMark}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
                className={`${inputClass} ${showNameError ? "border-[#f31260]" : ""}`}
                placeholder="e.g. Ventura CA, cold calls"
                autoFocus
                aria-invalid={showNameError}
              />
              {showNameError && <p className="text-[11px] text-[#f31260]">A campaign needs a name.</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>
                Description <span className="text-[#bbb]">(optional)</span>
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
                placeholder="What this list is for"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClass}>Leads {requiredMark}</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  value: "criteria" as Mode,
                  title: "Pick by filters",
                  hint: "From leads already on file",
                  icon: Filter,
                },
                {
                  value: "csv" as Mode,
                  title: "Upload a file",
                  hint: "Import Excel or CSV into this campaign",
                  icon: FileSpreadsheet,
                },
                { value: "empty" as Mode, title: "Start empty", hint: "Add leads later", icon: Circle },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  className={`flex items-start gap-2 text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    mode === opt.value ? "border-[#0a0a0a] bg-[#fafafa]" : "border-[#eaeaea] hover:bg-[#fafafa]"
                  }`}
                >
                  <opt.icon
                    className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${mode === opt.value ? "text-[#0a0a0a]" : "text-[#bbb]"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-[#0a0a0a]">{opt.title}</span>
                    <span className="block text-[11px] text-[#999] mt-0.5">{opt.hint}</span>
                  </span>
                  {mode === opt.value && <Check className="w-3.5 h-3.5 text-[#0a0a0a] shrink-0 mt-0.5" />}
                </button>
              ))}
            </div>
          </div>

          {mode === "csv" && (
            <div className="px-4 py-3 rounded-lg bg-[#fafafa] border border-[#eaeaea]">
              <p className="text-[13px] text-[#444]">Next step asks for the file {requiredMark}</p>
              <p className="text-[11px] text-[#999] mt-1 leading-relaxed">
                You&apos;ll map its columns and review the rows, the same as importing on the Leads tab. Duplicates are
                matched against leads already on file, and whatever imports lands on this campaign&apos;s sheet.
              </p>
            </div>
          )}

          {mode === "criteria" && (
            <>
              <LeadCriteriaFields criteria={criteria} onChange={setCriteria} onError={setError} />

              {/* How many, as a first-class choice rather than a footnote:
                  "everything in Ventura" and "the first 200 of them" are
                  different jobs. */}
              <div className="border-t border-[#f0f0f0] pt-4">
                <label className={labelClass}>How many leads</label>
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
                    {matching !== null && (
                      <span className="text-[#999] ml-1.5 tabular-nums">{matching.toLocaleString()}</span>
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
                {!limitAll && matching !== null && requested > matching && (
                  <p className="text-[11px] text-[#f5a524] mt-2">
                    Only {matching.toLocaleString()} lead{matching !== 1 ? "s" : ""} match, so that&apos;s all that will
                    be added.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#f0f0f0]">
          <p className="text-[12px] text-[#999] tabular-nums min-w-0 truncate">
            {mode === "empty" ? (
              "No leads will be added yet."
            ) : mode === "csv" ? (
              "Leads come from the file you pick next."
            ) : previewing ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Counting…
              </span>
            ) : preview?.failed ? (
              "Couldn't count the matches."
            ) : matching === null ? (
              "-"
            ) : !activeCriteria && limitAll ? (
              `All ${matching.toLocaleString()} leads will be added.`
            ) : (
              `${(willAdd ?? 0).toLocaleString()} lead${willAdd !== 1 ? "s" : ""} will be added.`
            )}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {error && (
              <p className="text-[12px] text-[#f31260] max-w-64 truncate" title={error}>
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
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-1.5 text-[13px] font-medium bg-[#0a0a0a] text-white px-4 py-2 rounded-md hover:bg-[#333] transition-colors disabled:opacity-40"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {mode === "csv" ? "Continue to file" : "Create campaign"}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
