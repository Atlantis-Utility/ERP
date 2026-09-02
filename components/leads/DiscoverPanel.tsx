"use client";

import { useState } from "react";
import { Search, Loader2, AlertCircle, Globe, Plus, Check } from "lucide-react";
import { addLead, type Lead } from "@/lib/db/leads";
import type { PlaceResult } from "@/lib/azure-maps";
import { formatAddress } from "@/lib/leads-constants";

type SearchState = "idle" | "loading" | "unconfigured" | "error" | "ok";

export default function DiscoverPanel({ savedPlaceIds, onSaved }: { savedPlaceIds: Set<string>; onSaved: () => void }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setState("loading");
    try {
      const res = await fetch(`/api/leads/places-search?q=${encodeURIComponent(query)}`);
      if (res.status === 503) { setState("unconfigured"); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.places ?? []);
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setState("error");
    }
  }

  async function save(place: PlaceResult) {
    setSavingId(place.placeId);
    try {
      const now = new Date().toISOString();
      const lead: Lead = {
        id: `place-${place.placeId}`,
        companyName: place.name,
        street: place.street,
        city: place.city,
        state: place.state,
        zip: place.zip,
        lat: place.lat,
        lon: place.lon,
        phone: place.phone,
        website: place.website,
        mapsPlaceId: place.placeId,
        source: "azure_maps",
        status: "new",
        createdAt: now,
        updatedAt: now,
      };
      await addLead(lead);
      onSaved();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="bg-white border border-[#eaeaea] rounded-xl p-4 mb-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-64">
          <label className="text-[10px] font-semibold text-[#999] uppercase tracking-wider">Discover with Azure Maps</label>
          <input
            type="text"
            placeholder="e.g. HVAC contractors in Boston, MA"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            className="text-sm border border-[#eaeaea] rounded-lg px-3 py-1.5 outline-none focus:border-[#0070f3] transition-colors w-full"
          />
        </div>
        <button
          onClick={search}
          disabled={!query.trim() || state === "loading"}
          className="flex items-center gap-2 bg-[#0070f3] text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-[#005fcc] transition-colors disabled:opacity-50"
        >
          {state === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
      </div>

      {state === "unconfigured" && (
        <p className="text-xs text-[#f5a524] mt-3 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Add <code className="bg-[#f1f1f1] px-1 rounded">AZURE_MAPS_KEY</code> to <code className="bg-[#f1f1f1] px-1 rounded">.env.local</code> (an Azure Maps account subscription key) to use discovery, then restart the server.
        </p>
      )}
      {state === "error" && (
        <p className="text-xs text-[#f31260] mt-3 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}</p>
      )}

      {state === "ok" && (
        <div className="mt-4 border-t border-[#f0f0f0] pt-3">
          {results.length === 0 ? (
            <p className="text-sm text-[#999]">No results.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {results.map((p) => {
                const already = savedPlaceIds.has(p.placeId);
                return (
                  <div key={p.placeId} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-[#fafafa] transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0a0a0a] truncate">{p.name}</p>
                      <p className="text-xs text-[#999] truncate">{formatAddress(p)}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {p.phone && <span className="text-xs text-[#666] font-mono">{p.phone}</span>}
                        {p.website && (
                          <a href={p.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-[#0070f3] hover:underline truncate">
                            <Globe className="w-3 h-3" /> Website
                          </a>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => save(p)}
                      disabled={already || savingId === p.placeId}
                      className={`shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                        already
                          ? "bg-[#f0fdf4] text-[#17c964] cursor-default"
                          : "bg-[#0070f3] text-white hover:bg-[#005fcc] disabled:opacity-50"
                      }`}
                    >
                      {savingId === p.placeId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : already ? (
                        <><Check className="w-3.5 h-3.5" /> Saved</>
                      ) : (
                        <><Plus className="w-3.5 h-3.5" /> Save as Lead</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
