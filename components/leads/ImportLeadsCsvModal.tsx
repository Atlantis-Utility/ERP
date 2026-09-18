"use client";

import { useMemo, useState } from "react";
import Overlay from "@/components/ui/Overlay";
import { X, FileSpreadsheet, UploadCloud, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import Select from "@/components/ui/Select";
import { guessColumnMapping } from "@/lib/csv";
import { readSpreadsheet, SpreadsheetError, SPREADSHEET_ACCEPT, type SheetData } from "@/lib/spreadsheet";
import { addLeads, fetchDedupeIndex, fetchLeadsByIds, type Lead } from "@/lib/db/leads";
import type { ActivityActor } from "@/lib/db/lead-activity";
import { getErrorMessage } from "@/lib/utils";
import {
  addressKey,
  buildCompanyIndex,
  findExistingMatch,
  computeMerge,
  applyResolutions,
  type MergeResult,
} from "@/lib/leads-merge";

type Step = "upload" | "map" | "review" | "conflicts";
type Resolution = "existing" | "new";

interface ParsedRow {
  id: string;
  companyName: string;
  dba: string;
  businessType: string;
  description: string;
  fullName: string;
  title: string;
  phone: string;
  email: string;
  companySize: string;
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
  { key: "description", label: "Description", required: false },
  { key: "fullName", label: "Contact Name", required: false },
  { key: "title", label: "Title / Designation", required: false },
  // Phone and email were missing here entirely, so a file that carried them
  // had no column to map them to and the values were dropped on import.
  { key: "phone", label: "Phone", required: false },
  { key: "email", label: "Email", required: false },
  { key: "companySize", label: "Company Size", required: false },
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

export default function ImportLeadsCsvModal({
  onClose,
  onImported,
  actor,
  submitLabel,
}: {
  onClose: () => void;
  /**
   * How many leads were written, and which ones, the ids let a caller do
   * something with exactly this import (a campaign built from a file adds
   * them to its sheet).
   */
  onImported: (count: number, leadIds: string[]) => void;
  actor: ActivityActor | null;
  /** Wording for the confirm button when the import feeds something else. */
  submitLabel?: string;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  // A workbook can hold several sheets, only one of which is the lead list.
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [parseError, setParseError] = useState("");

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [matching, setMatching] = useState(false);
  const [skippedDuplicates, setSkippedDuplicates] = useState(0);
  const [progress, setProgress] = useState<{ written: number; total: number } | null>(null);
  const [importError, setImportError] = useState("");

  const [mergeResults, setMergeResults] = useState<MergeResult[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, Record<string, Resolution>>>({});

  const canContinueMapping = Boolean(mapping.companyName);

  // Loads one sheet's headers and rows into the mapping step. Re-guessing the
  // mapping per sheet matters: two tabs of the same workbook rarely share a
  // layout, and carrying the previous guess over would quietly read the wrong
  // columns.
  function selectSheet(all: SheetData[], index: number) {
    const sheet = all[index];
    if (!sheet) return;
    setSheetIndex(index);
    setHeaders(sheet.headers);
    setRawRows(sheet.rows);
    setMapping(guessColumnMapping(sheet.headers));
    setRows([]);
  }

  async function handleFile(file: File) {
    setParseError("");
    setParsing(true);
    try {
      const { sheets: parsed } = await readSpreadsheet(file);
      // Open on the first sheet that has rows: the lead list is often the
      // second tab, after a cover sheet or a set of instructions.
      const firstWithRows = parsed.findIndex((s) => s.headers.length > 0 && s.rows.length > 0);
      if (firstWithRows < 0) {
        setParseError(
          parsed.length > 1
            ? "None of the sheets in that workbook have any data rows."
            : "Couldn't find any data rows in that file.",
        );
        return;
      }
      setFileName(file.name);
      setSheets(parsed);
      selectSheet(parsed, firstWithRows);
      setStep("map");
    } catch (e) {
      // Every SpreadsheetError says what to do about it, so it's shown as
      // written rather than replaced with a generic failure.
      setParseError(
        e instanceof SpreadsheetError
          ? e.message
          : getErrorMessage(e, "Failed to read that file. Make sure it's a CSV or Excel export."),
      );
    } finally {
      setParsing(false);
    }
  }

  function buildRowsFromMapping() {
    const idx = (field: string) => headers.indexOf(mapping[field]);
    const get = (r: string[], field: string) => {
      const i = idx(field);
      return i >= 0 ? (r[i] ?? "").trim() : "";
    };

    const built: ParsedRow[] = rawRows
      .map((r, i) => ({
        id: `row-${i}-${Date.now()}`,
        companyName: get(r, "companyName"),
        dba: get(r, "dba"),
        businessType: get(r, "businessType"),
        description: get(r, "description"),
        fullName: get(r, "fullName"),
        title: get(r, "title"),
        phone: get(r, "phone"),
        email: get(r, "email"),
        companySize: get(r, "companySize"),
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
      }))
      .filter((r) => r.companyName);

    setRows(built);
    setStep("review");
  }

  function buildCandidateLeads(): Lead[] {
    const now = new Date().toISOString();
    return rows
      .filter((r) => r.included)
      .map((r) => ({
        id: `lead-${crypto.randomUUID()}`,
        companyName: r.companyName,
        dba: r.dba || undefined,
        businessType: r.businessType || undefined,
        description: r.description || undefined,
        pocName: r.fullName || undefined,
        pocTitle: r.title || undefined,
        phone: r.phone || undefined,
        email: r.email || undefined,
        companySize: r.companySize || undefined,
        website: r.website || undefined,
        street: r.street || undefined,
        city: r.city || undefined,
        state: r.state || undefined,
        zip: r.zip || undefined,
        location: r.location || undefined,
        linkedinUrl: r.linkedinUrl || undefined,
        instagramUrl: r.instagramUrl || undefined,
        facebookUrl: r.facebookUrl || undefined,
        source: "file_import",
        status: "new",
        createdAt: now,
        updatedAt: now,
      }));
  }

  async function commitImport(leads: Lead[]) {
    setImporting(true);
    setImportError("");
    setProgress(null);
    try {
      // A ten-thousand-row import takes a while and goes up in chunks, so
      // report how far it's got rather than showing a spinner for a minute.
      await addLeads(leads, actor, (written, total) => setProgress(total > 500 ? { written, total } : null));
      onImported(
        leads.length,
        leads.map((l) => l.id),
      );
      onClose();
    } catch (e) {
      // Imported leads have no owner, and only an administrator may create an
      // unowned lead, so a permission error here is a real, explainable
      // outcome rather than an unexpected failure.
      setImportError(getErrorMessage(e, "Failed to import leads"));
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  // Matches every candidate against leads already on file (same company,
  // same person). Anything that's a clean fill (existing field was empty) or
  // an exact re-import (same value on both sides) gets merged and written
  // immediately, no prompt needed. Only genuine conflicts (a field set to
  // different values on both sides) stop short of writing and go to the
  // conflict-resolution step instead.
  // Dedupe runs against the live table, in two passes, so this works the
  // same whether there are 200 leads on file or 20,000:
  //   1. pull a slim index (id + company + contact name only) and find which
  //      incoming rows collide with something already there;
  //   2. fetch just those colliding leads in full, which is what the
  //      field-level merge actually needs.
  // Matching against a full client-side copy of the table (the old approach)
  // both moved megabytes and, once the page stopped syncing every lead, would
  // have silently compared against only the rows that happened to be loaded
  // and re-imported everything else as a duplicate.
  async function handleImportClick() {
    setImportError("");
    setMatching(true);
    try {
      const candidates = buildCandidateLeads();
      const index = buildCompanyIndex(await fetchDedupeIndex());

      // Duplicates are reported rather than silently dropped, either way:
      // the count appears above the button before anything is written.
      const matchedIds = new Map<string, string>(); // candidate id → existing lead id
      const claimed = new Set<string>();
      const duplicateKeys = new Set<string>();
      // Rows of this file that are the same business as an earlier row. This
      // is the case the table can't catch: none of them exist yet, so none of
      // them matches anything, and every one becomes a lead. A city licence
      // list repeats a company once per permit, which is how one hotel turned
      // into six leads at the same address, 917 across the file.
      const seenInFile = new Set<string>();
      for (const c of candidates) {
        const hit = findExistingMatch(index, c);
        if (hit) {
          // First row to match a given lead claims it. Two rows matching the
          // same lead can't both be imported: they'd share a target id, which
          // makes the upsert hit the same row twice ("ON CONFLICT DO UPDATE
          // command cannot affect row a second time") and collapses their
          // resolutions into one.
          if (claimed.has(hit.id)) {
            duplicateKeys.add(c.id);
            continue;
          }
          claimed.add(hit.id);
          matchedIds.set(c.id, hit.id);
          continue;
        }
        // New to us, but maybe not new to this file. Keyed on the address
        // where there is one, otherwise on company + contact name.
        const key = addressKey(c) || `${c.companyName.trim().toLowerCase()}|${(c.pocName ?? "").trim().toLowerCase()}`;
        if (!key.replace(/\|/g, "")) continue;
        if (seenInFile.has(key)) duplicateKeys.add(c.id);
        else seenInFile.add(key);
      }
      setSkippedDuplicates(duplicateKeys.size);

      const existingById = new Map((await fetchLeadsByIds([...new Set(matchedIds.values())])).map((l) => [l.id, l]));

      const results = candidates
        .filter((c) => !duplicateKeys.has(c.id))
        .map((c) => {
          const existingId = matchedIds.get(c.id);
          return computeMerge(existingId ? existingById.get(existingId) : undefined, c);
        });
      const withConflicts = results.filter((r) => r.conflicts.length > 0);

      if (withConflicts.length === 0) {
        commitImport(results.map((r) => r.base));
        return;
      }

      setMergeResults(results);
      const initial: Record<string, Record<string, Resolution>> = {};
      for (const r of withConflicts) {
        initial[r.key] = Object.fromEntries(r.conflicts.map((c) => [c.key, "existing" as Resolution]));
      }
      setResolutions(initial);
      setStep("conflicts");
    } catch (e) {
      setImportError(getErrorMessage(e, "Failed to check for duplicates"));
    } finally {
      setMatching(false);
    }
  }

  // Keyed by MergeResult.key, the *row* in the file, never by `id`, which is
  // the lead that will be written: two rows can resolve to the same lead, and
  // keying on it made them share one set of choices. Everything else here
  // reads by key, so writing by id silently discarded the click.
  function setFieldResolution(rowKey: string, field: string, choice: Resolution) {
    setResolutions((prev) => ({ ...prev, [rowKey]: { ...prev[rowKey], [field]: choice } }));
  }

  // "Keep existing" only decides the *conflicts* listed here. Fields the
  // existing lead had nothing in were already filled from the file by
  // computeMerge, which is why there's no third "fill blanks" mode, that
  // part isn't optional, and offering it as a choice would imply the
  // alternative is to leave good data on the floor.
  function setAllResolutions(choice: Resolution) {
    setResolutions((prev) => {
      const next: Record<string, Record<string, Resolution>> = {};
      for (const [rowKey, fields] of Object.entries(prev)) {
        next[rowKey] = Object.fromEntries(Object.keys(fields).map((f) => [f, choice]));
      }
      return next;
    });
  }

  function applyResolutionsAndImport() {
    const finalLeads = mergeResults.map((r) =>
      r.conflicts.length > 0 ? applyResolutions(r, resolutions[r.key] ?? {}) : r.base,
    );
    commitImport(finalLeads);
  }

  const includedCount = useMemo(() => rows.filter((r) => r.included).length, [rows]);
  const conflictingResults = useMemo(() => mergeResults.filter((r) => r.conflicts.length > 0), [mergeResults]);

  return (
    <Overlay onDismiss={onClose} className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      dismissable={!importing && !parsing && !matching}>
      <div className="bg-white border border-[#eaeaea] rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#eaeaea] shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#0070f3]" />
            <p className="text-sm font-semibold text-[#0a0a0a]">Import leads</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#f5f5f5] transition-colors text-[#999]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {step === "upload" && (
            <div>
              <p className="text-xs text-[#666] mb-4">
                Upload an Excel workbook or a CSV: a purchased list, a Sales Navigator export, a sheet someone keeps by
                hand. Whatever it carries (company, contact, address, socials) gets mapped straight in, fill in anything
                else by hand afterward.
              </p>
              {/* The label is the drop target as well as the picker, so the
                  "or drag and drop" it advertises actually works. */}
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors ${
                  dragging ? "border-[#0070f3] bg-[#f5faff]" : "border-[#eaeaea] hover:border-[#0070f3] hover:bg-[#fafafa]"
                }`}
              >
                {parsing ? (
                  <>
                    <Loader2 className="w-6 h-6 text-[#0070f3] animate-spin" />
                    <span className="text-sm font-medium text-[#0a0a0a]">Reading the file…</span>
                    <span className="text-xs text-[#999]">A large workbook can take a moment</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-6 h-6 text-[#999]" />
                    <span className="text-sm font-medium text-[#0a0a0a]">Click to choose a file</span>
                    <span className="text-xs text-[#999]">or drag and drop, .xlsx or .csv</span>
                  </>
                )}
                <input
                  type="file"
                  accept={SPREADSHEET_ACCEPT}
                  disabled={parsing}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    // Cleared so picking the same file twice (after fixing it
                    // in Excel) still fires a change event.
                    e.target.value = "";
                    if (f) handleFile(f);
                  }}
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
                <span className="font-medium text-[#0a0a0a]">{fileName}</span>: {rawRows.length.toLocaleString()} row
                {rawRows.length !== 1 ? "s" : ""} found. Match each field below to a column from your file.
              </p>

              {sheets.length > 1 && (
                <div className="flex flex-col gap-1 mb-4">
                  <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Sheet</label>
                  <Select
                    value={String(sheetIndex)}
                    onChange={(v) => selectSheet(sheets, Number(v))}
                    options={sheets.map((s, i) => ({
                      value: String(i),
                      label: `${s.name} (${s.rows.length.toLocaleString()} row${s.rows.length !== 1 ? "s" : ""})`,
                    }))}
                  />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MAPPING_FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">
                      {f.label}
                      {f.required && " *"}
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
                        <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-3 py-2">
                          Contact
                        </th>
                        <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-3 py-2">
                          Company
                        </th>
                        <th className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-3 py-2">
                          Location
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b border-[#f7f7f7] last:border-0">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={r.included}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((x) => (x.id === r.id ? { ...x, included: e.target.checked } : x)),
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-sm text-[#0a0a0a]">{r.fullName || "-"}</p>
                            <p className="text-xs text-[#999]">{r.title || "-"}</p>
                            {/* Shown so a wrong column mapping is obvious here
                                rather than after thousands of rows are in. */}
                            {(r.phone || r.email) && (
                              <p className="text-xs text-[#666] mt-0.5 truncate max-w-48">
                                {[r.phone, r.email].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-sm text-[#0a0a0a]">{r.companyName || "-"}</p>
                            <p className="text-xs text-[#999]">
                              {[r.dba && `DBA: ${r.dba}`, r.businessType].filter(Boolean).join(" · ") || "-"}
                            </p>
                            {r.description && (
                              <p className="text-xs text-[#999] mt-0.5 line-clamp-2 max-w-sm">{r.description}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-[#666]">{rowLocation(r) || "-"}</td>
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
              <div className="mb-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-[#666] leading-relaxed">
                    {conflictingResults.length} lead{conflictingResults.length !== 1 ? "s" : ""} already on file have a
                    <em> different</em> value in these fields. Only genuine disagreements are listed, anything the
                    existing lead was missing has already been filled in from the file.
                    {skippedDuplicates > 0 && (
                      <>
                        {" "}
                        <span className="text-[#f5a524]">
                          {skippedDuplicates.toLocaleString()} row{skippedDuplicates !== 1 ? "s" : ""} in the file
                          {skippedDuplicates !== 1 ? " are duplicates" : " is a duplicate"} of another row and
                          {skippedDuplicates !== 1 ? " were" : " was"} skipped.
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* The first option is what most imports want, so it reads
                      as the whole rule rather than "discard the new file". */}
                  <button
                    onClick={() => setAllResolutions("existing")}
                    className="text-xs font-medium text-white bg-[#0a0a0a] rounded-lg px-2.5 py-1.5 hover:bg-[#333] transition-colors"
                  >
                    Keep existing, fill blanks only
                  </button>
                  <button
                    onClick={() => setAllResolutions("new")}
                    className="text-xs font-medium text-[#0a0a0a] border border-[#eaeaea] rounded-lg px-2.5 py-1.5 hover:bg-[#fafafa] transition-colors"
                  >
                    Use new data for all
                  </button>
                  <span className="text-[11px] text-[#bbb]">or choose per field below</span>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {conflictingResults.map((r) => (
                  <div key={r.key} className="border border-[#eaeaea] rounded-lg p-3">
                    <p className="text-sm font-medium text-[#0a0a0a] mb-2">
                      {r.base.companyName}
                      {r.base.pocName ? `, ${r.base.pocName}` : ""}
                    </p>
                    <div className="space-y-2">
                      {r.conflicts.map((c) => {
                        const choice = resolutions[r.key]?.[c.key] ?? "existing";
                        return (
                          <div key={c.key} className="flex items-center gap-3 text-xs">
                            <span className="text-[#999] w-28 shrink-0">{c.label}</span>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <button
                                onClick={() => setFieldResolution(r.key, c.key, "existing")}
                                className={`flex-1 min-w-0 truncate text-left px-2.5 py-1.5 rounded-lg border transition-colors ${
                                  choice === "existing"
                                    ? "border-[#0070f3] bg-[#e8f2ff] text-[#0a0a0a]"
                                    : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
                                }`}
                                title={c.existingValue}
                              >
                                Keep: {c.existingValue}
                              </button>
                              <button
                                onClick={() => setFieldResolution(r.key, c.key, "new")}
                                className={`flex-1 min-w-0 truncate text-left px-2.5 py-1.5 rounded-lg border transition-colors ${
                                  choice === "new"
                                    ? "border-[#0070f3] bg-[#e8f2ff] text-[#0a0a0a]"
                                    : "border-[#eaeaea] text-[#666] hover:bg-[#fafafa]"
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
            {(progress || matching) && (
              <p className="text-xs text-[#666] tabular-nums">
                {matching
                  ? "Checking for duplicates…"
                  : `Writing ${progress!.written.toLocaleString()} of ${progress!.total.toLocaleString()}…`}
              </p>
            )}
            <button
              onClick={onClose}
              className="text-sm border border-[#eaeaea] bg-white text-[#0a0a0a] font-medium px-4 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors"
            >
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
                disabled={importing || matching || includedCount === 0}
                className="flex items-center gap-2 text-sm bg-[#0070f3] text-white font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50"
              >
                {importing || matching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                {submitLabel ?? `Import ${includedCount.toLocaleString()} lead${includedCount !== 1 ? "s" : ""}`}
              </button>
            )}
            {step === "conflicts" && (
              <button
                onClick={applyResolutionsAndImport}
                disabled={importing}
                className="flex items-center gap-2 text-sm bg-[#0070f3] text-white font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50"
              >
                {importing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Apply &amp; Import
              </button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}
