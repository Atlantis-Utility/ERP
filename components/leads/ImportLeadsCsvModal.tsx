"use client";

import { useMemo, useState } from "react";
import {
  X, FileSpreadsheet, UploadCloud, AlertCircle, Loader2, CheckCircle2,
} from "lucide-react";
import Select from "@/components/ui/Select";
import { parseCsv, guessColumnMapping } from "@/lib/csv";
import { addLeads, type Lead } from "@/lib/db/leads";
import { buildCompanyIndex, findExistingMatch, computeMerge, applyResolutions, type MergeResult } from "@/lib/leads-merge";

type Step = "upload" | "map" | "review" | "conflicts";
type Resolution = "existing" | "new";

interface ParsedRow {
  id: string;
  companyName: string;
  dba: string;
  businessType: string;
  fullName: string;
  title: string;
  website: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  location: string;
  linkedinUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  included: boolean;
}

const MAPPING_FIELDS: { key: string; label: string; required: boolean }[] = [
  { key: "companyName", label: "Company Name", required: true },
  { key: "dba", label: "DBA", required: false },
  { key: "businessType", label: "Business Type", required: false },
  { key: "fullName", label: "Full Name", required: false },
  { key: "title", label: "Title / Designation", required: false },
  { key: "website", label: "Website", required: false },
  { key: "street", label: "Street", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "zip", label: "Zip Code", required: false },
  { key: "location", label: "Location (if no street/city/state)", required: false },
  { key: "linkedinUrl", label: "LinkedIn Profile URL", required: false },
  { key: "instagramUrl", label: "Instagram", required: false },
  { key: "facebookUrl", label: "Facebook", required: false },
];

function rowLocation(r: ParsedRow): string {
  const structured = [r.street, r.city, r.state, r.zip].filter(Boolean).join(" ");
  return structured || r.location;
}

export default function ImportLeadsCsvModal({ onClose, onImported, existingLeads }: { onClose: () => void; onImported: () => void; existingLeads: Lead[] }) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState("");

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  const [mergeResults, setMergeResults] = useState<MergeResult[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, Record<string, Resolution>>>({});

  const canContinueMapping = Boolean(mapping.companyName);

  async function handleFile(file: File) {
    setParseError("");
    try {
      const text = await file.text();
      const { headers: h, rows: r } = parseCsv(text);
      if (h.length === 0 || r.length === 0) {
        setParseError("Couldn't find any data rows in that file.");
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setRawRows(r);
      setMapping(guessColumnMapping(h));
      setStep("map");
    } catch {
      setParseError("Failed to read that file. Make sure it's a CSV export.");
    }
  }

  function buildRowsFromMapping() {
    const idx = (field: string) => headers.indexOf(mapping[field]);
    const get = (r: string[], field: string) => {
      const i = idx(field);
      return i >= 0 ? (r[i] ?? "").trim() : "";
    };

    const built: ParsedRow[] = rawRows.map((r, i) => ({
      id: `row-${i}-${Date.now()}`,
      companyName: get(r, "companyName"),
      dba: get(r, "dba"),
      businessType: get(r, "businessType"),
      fullName: get(r, "fullName"),
      title: get(r, "title"),
      website: get(r, "website"),
      street: get(r, "street"),
      city: get(r, "city"),
      state: get(r, "state"),
      zip: get(r, "zip"),
      location: get(r, "location"),
      linkedinUrl: get(r, "linkedinUrl"),
      instagramUrl: get(r, "instagramUrl"),
      facebookUrl: get(r, "facebookUrl"),
      included: true,
    })).filter((r) => r.companyName);

    setRows(built);
    setStep("review");
  }

  function buildCandidateLeads(): Lead[] {
    const now = new Date().toISOString();
    return rows.filter((r) => r.included).map((r) => ({
      id: `lead-${crypto.randomUUID()}`,
      companyName: r.companyName,
      dba: r.dba || undefined,
      businessType: r.businessType || undefined,
      pocName: r.fullName || undefined,
      pocTitle: r.title || undefined,
      website: r.website || undefined,
      street: r.street || undefined,
      city: r.city || undefined,
      state: r.state || undefined,
      zip: r.zip || undefined,
      location: r.location || undefined,
      linkedinUrl: r.linkedinUrl || undefined,
      instagramUrl: r.instagramUrl || undefined,
      facebookUrl: r.facebookUrl || undefined,
      source: "linkedin_csv",
      status: "new",
      createdAt: now,
      updatedAt: now,
    }));
  }

  async function commitImport(leads: Lead[]) {
    setImporting(true);
    setImportError("");
    try {
      await addLeads(leads);
      onImported();
      onClose();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to import leads");
    } finally {
      setImporting(false);
    }
  }

  // Matches every candidate against leads already on file (same company,
  // same person). Anything that's a clean fill (existing field was empty) or
  // an exact re-import (same value on both sides) gets merged and written
  // immediately, no prompt needed. Only genuine conflicts (a field set to
  // different values on both sides) stop short of writing and go to the
  // conflict-resolution step instead.
  function handleImportClick() {
    setImportError("");
    const candidates = buildCandidateLeads();
    const index = buildCompanyIndex(existingLeads);
    const results = candidates.map((c) => computeMerge(findExistingMatch(index, c.companyName, c.pocName), c));
    const withConflicts = results.filter((r) => r.conflicts.length > 0);

    if (withConflicts.length === 0) {
      commitImport(results.map((r) => r.base));
      return;
    }

    setMergeResults(results);
    const initial: Record<string, Record<string, Resolution>> = {};
    for (const r of withConflicts) {
      initial[r.id] = Object.fromEntries(r.conflicts.map((c) => [c.key, "existing" as Resolution]));
    }
    setResolutions(initial);
    setStep("conflicts");
  }

  function setFieldResolution(resultId: string, field: string, choice: Resolution) {
    setResolutions((prev) => ({ ...prev, [resultId]: { ...prev[resultId], [field]: choice } }));
  }

  function setAllResolutions(choice: Resolution) {
    setResolutions((prev) => {
      const next: Record<string, Record<string, Resolution>> = {};
      for (const [resultId, fields] of Object.entries(prev)) {
        next[resultId] = Object.fromEntries(Object.keys(fields).map((f) => [f, choice]));
      }
      return next;
    });
  }

  function applyResolutionsAndImport() {
    const finalLeads = mergeResults.map((r) => (r.conflicts.length > 0 ? applyResolutions(r, resolutions[r.id] ?? {}) : r.base));
    commitImport(finalLeads);
  }

  const includedCount = useMemo(() => rows.filter((r) => r.included).length, [rows]);
  const conflictingResults = useMemo(() => mergeResults.filter((r) => r.conflicts.length > 0), [mergeResults]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#eaeaea] shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#0070f3]" />
            <p className="text-sm font-semibold text-[#0a0a0a]">Import CSV</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#999]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {step === "upload" && (
            <div>
              <p className="text-xs text-[#666] mb-4">
                Export a saved lead list from Sales Navigator to CSV, then upload it here.
                Whatever the export gives you (company, contact, address, socials) gets mapped
                straight in, fill in anything else by hand afterward.
              </p>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#eaeaea] rounded-xl p-10 cursor-pointer hover:border-[#0070f3] hover:bg-[#fafafa] transition-colors">
                <UploadCloud className="w-6 h-6 text-[#999]" />
                <span className="text-sm font-medium text-[#0a0a0a]">Click to choose a .csv file</span>
                <span className="text-xs text-[#999]">or drag and drop</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </label>
              {parseError && (
                <p className="text-xs text-[#f31260] mt-3 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> {parseError}
                </p>
              )}
            </div>
          )}

          {step === "map" && (
            <div>
              <p className="text-xs text-[#666] mb-4">
                <span className="font-medium text-[#0a0a0a]">{fileName}</span>: {rawRows.length} row{rawRows.length !== 1 ? "s" : ""} found.
                Match each field below to a column from your file.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {MAPPING_FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">
                      {f.label}{f.required && " *"}
                    </label>
                    <Select
                      value={mapping[f.key] ?? ""}
                      onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                      placeholder="Not in file"
                      options={headers.map((h) => ({ value: h, label: h }))}
                      clearable
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "review" && (
            <div>
              <p className="text-xs text-[#666] mb-3">
                {includedCount} lead{includedCount !== 1 ? "s" : ""} ready to import
              </p>

              <div className="border border-[#eaeaea] rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#eaeaea] bg-[#fafafa]">
                        <th className="w-8 px-3 py-2"></th>
                        <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-3 py-2">Contact</th>
                        <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-3 py-2">Company</th>
                        <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-3 py-2">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b border-[#f7f7f7] last:border-0">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={r.included}
                              onChange={(e) => setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, included: e.target.checked } : x))}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-sm text-[#0a0a0a]">{r.fullName || "-"}</p>
                            <p className="text-xs text-[#999]">{r.title || "-"}</p>
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-sm text-[#0a0a0a]">{r.companyName || "-"}</p>
                            <p className="text-xs text-[#999]">
                              {[r.dba && `DBA: ${r.dba}`, r.businessType].filter(Boolean).join(" · ") || "-"}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-xs text-[#666]">
                            {rowLocation(r) || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {importError && (
                <p className="text-xs text-[#f31260] mt-3 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> {importError}
                </p>
              )}
            </div>
          )}

          {step === "conflicts" && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-4">
                <p className="text-xs text-[#666]">
                  {conflictingResults.length} lead{conflictingResults.length !== 1 ? "s" : ""} already on file have
                  conflicting data. Choose which value to keep for each field, or apply one choice to everything.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setAllResolutions("existing")} className="text-xs font-medium text-[#0a0a0a] border border-[#eaeaea] rounded-lg px-2.5 py-1 hover:bg-[#fafafa] transition-colors">
                    Keep existing for all
                  </button>
                  <button onClick={() => setAllResolutions("new")} className="text-xs font-medium text-white bg-[#0070f3] rounded-lg px-2.5 py-1 hover:bg-[#005fcc] transition-colors">
                    Use new data for all
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {conflictingResults.map((r) => (
                  <div key={r.id} className="border border-[#eaeaea] rounded-lg p-3">
                    <p className="text-sm font-medium text-[#0a0a0a] mb-2">
                      {r.base.companyName}{r.base.pocName ? `, ${r.base.pocName}` : ""}
                    </p>
                    <div className="space-y-2">
                      {r.conflicts.map((c) => {
                        const choice = resolutions[r.id]?.[c.key] ?? "existing";
                        return (
                          <div key={c.key} className="flex items-center gap-3 text-xs">
                            <span className="text-[#999] w-28 shrink-0">{c.label}</span>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <button
                                onClick={() => setFieldResolution(r.id, c.key, "existing")}
                                className={`flex-1 min-w-0 truncate text-left px-2.5 py-1.5 rounded-lg border transition-colors ${
                                  choice === "existing" ? "border-[#0070f3] bg-[#e8f2ff] text-[#0a0a0a]" : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
                                }`}
                                title={c.existingValue}
                              >
                                Keep: {c.existingValue}
                              </button>
                              <button
                                onClick={() => setFieldResolution(r.id, c.key, "new")}
                                className={`flex-1 min-w-0 truncate text-left px-2.5 py-1.5 rounded-lg border transition-colors ${
                                  choice === "new" ? "border-[#0070f3] bg-[#e8f2ff] text-[#0a0a0a]" : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
                                }`}
                                title={c.newValue}
                              >
                                Use new: {c.newValue}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {importError && (
                <p className="text-xs text-[#f31260] mt-3 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> {importError}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#eaeaea] shrink-0">
          <div>
            {step !== "upload" && (
              <button
                onClick={() => setStep(step === "conflicts" ? "review" : step === "review" ? "map" : "upload")}
                className="text-sm border border-[#eaeaea] bg-white text-[#0a0a0a] font-medium px-4 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm border border-[#eaeaea] bg-white text-[#0a0a0a] font-medium px-4 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors">
              Cancel
            </button>
            {step === "map" && (
              <button
                onClick={buildRowsFromMapping}
                disabled={!canContinueMapping}
                className="text-sm bg-[#0070f3] text-white font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50"
              >
                Continue
              </button>
            )}
            {step === "review" && (
              <button
                onClick={handleImportClick}
                disabled={importing || includedCount === 0}
                className="flex items-center gap-2 text-sm bg-[#0070f3] text-white font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Import {includedCount} lead{includedCount !== 1 ? "s" : ""}
              </button>
            )}
            {step === "conflicts" && (
              <button
                onClick={applyResolutionsAndImport}
                disabled={importing}
                className="flex items-center gap-2 text-sm bg-[#0070f3] text-white font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Apply &amp; Import
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
