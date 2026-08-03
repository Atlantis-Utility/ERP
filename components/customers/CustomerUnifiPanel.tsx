"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Wifi, RefreshCw, AlertCircle, ExternalLink, Search,
  CheckCircle, XCircle, Link2, Unlink, Server, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { UiEnrichedSite, UiDevice, UiRealTopology } from "@/lib/unifi";
import { getUnifiLink, setUnifiLink, removeUnifiLink, type CustomerUnifiLink } from "@/lib/db/unifi-links";
import { getCustomerProfile, setCustomerProfile, DEFAULT_CONTACT_ID } from "@/lib/db/customer-profiles";
import IspLogo from "@/components/unifi/IspLogo";
import SiteTopology from "@/components/unifi/SiteTopology";
import RealTopology from "@/components/unifi/RealTopology";
import ZoomPan from "@/components/unifi/ZoomPan";
import { matchScore, LIKELY_MATCH_THRESHOLD } from "@/lib/name-match";

type PanelState = "loading" | "unconfigured" | "error" | "ok";

function SitePicker({
  sites,
  companyName,
  onPick,
  onClose,
}: {
  sites: UiEnrichedSite[];
  companyName: string;
  onPick: (site: UiEnrichedSite) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");

  // Ranked by relevance to the customer's name when browsing; a plain
  // substring filter (on the raw display name) takes over once the admin
  // starts typing their own search.
  const ranked = useMemo(() => {
    return sites
      .map((s) => ({ site: s, score: matchScore(companyName, s.displayName) }))
      .sort((a, b) => b.score - a.score || a.site.displayName.localeCompare(b.site.displayName));
  }, [sites, companyName]);

  const filtered = search
    ? sites
        .filter((s) => s.displayName.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((site) => ({ site, score: 0 }))
    : ranked;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl border border-[#eaeaea] shadow-xl w-full max-w-md max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f0f0] shrink-0">
          <p className="text-sm font-semibold text-[#111]">Link a UniFi site</p>
          <button onClick={onClose} className="text-[#999] hover:text-[#111]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 border-b border-[#f0f0f0] shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#bbb] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              type="text"
              placeholder="Search sites..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs border border-[#eaeaea] rounded-lg pl-8 pr-3 py-2 outline-none focus:border-[#999] transition-colors"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-[#999] text-center py-8">No sites match.</p>
          ) : (
            filtered.map(({ site: s, score }) => {
              const likely = !search && score >= LIKELY_MATCH_THRESHOLD;
              return (
                <button
                  key={s.siteId}
                  onClick={() => onPick(s)}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 transition-colors border-b last:border-0 text-left ${
                    likely ? "bg-[#eff6ff] hover:bg-[#e0efff] border-[#f0f0f0]" : "hover:bg-[#fafafa] border-[#f7f7f7]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`text-xs font-medium truncate ${likely ? "text-[#0070f3]" : "text-[#333]"}`}>{s.displayName}</p>
                    {likely && <p className="text-[10px] text-[#0070f3]/70">Likely match</p>}
                  </div>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.connected ? "bg-[#22c55e]" : "bg-[#9ca3af]"}`} />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomerUnifiPanel({ customerId, companyName, bare }: { customerId: string; companyName: string; bare?: boolean }) {
  const { authUser } = useAuth();
  const [state, setState] = useState<PanelState>("loading");
  const [error, setError] = useState("");
  const [link, setLink] = useState<CustomerUnifiLink | null>(null);
  const [sites, setSites] = useState<UiEnrichedSite[]>([]);
  const [devices, setDevices] = useState<UiDevice[]>([]);
  const [topology, setTopology] = useState<UiRealTopology | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setState("loading");
    setError("");
    try {
      const [sitesRes, existingLink] = await Promise.all([
        fetch("/api/unifi/sites"),
        getUnifiLink(customerId),
      ]);

      if (sitesRes.status === 503) { setState("unconfigured"); return; }
      if (!sitesRes.ok) { const d = await sitesRes.json(); throw new Error(d.error); }
      const sitesJson = await sitesRes.json();
      const allSites: UiEnrichedSite[] = sitesJson.data ?? [];
      setSites(allSites);
      setLink(existingLink);

      if (existingLink) {
        const [devRes, topoRes] = await Promise.all([
          fetch(`/api/unifi/devices?siteId=${existingLink.siteId}`),
          fetch(`/api/unifi/topology?siteId=${existingLink.siteId}`),
        ]);
        if (devRes.ok) {
          const devJson = await devRes.json();
          setDevices(devJson.data ?? []);
        }
        if (topoRes.ok) {
          setTopology(await topoRes.json());
        }
      }
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setState("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function handlePick(site: UiEnrichedSite) {
    setSaving(true);
    setPickerOpen(false);
    try {
      await setUnifiLink(customerId, { siteId: site.siteId, hostId: site.hostId, siteName: site.displayName }, authUser?.email);
      await syncIspFromSite(site);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link site");
    } finally {
      setSaving(false);
    }
  }

  // Seeds the ISP/Backup ISP fields from the linked site's real WAN data —
  // only fills in blanks, never overwrites something already entered by hand.
  async function syncIspFromSite(site: UiEnrichedSite) {
    const primary = site.wans[0]?.ispName || site.ispName || "";
    const backup = site.wans[1]?.ispName || "";
    if (!primary && !backup) return;
    try {
      const existing = await getCustomerProfile(customerId);
      if (existing?.isp && existing?.backupIsp) return; // both already set — nothing to fill
      await setCustomerProfile(customerId, {
        isp: existing?.isp || primary,
        backupIsp: existing?.backupIsp || backup,
        contacts: existing?.contacts ?? [],
        mainContactId: existing?.mainContactId ?? DEFAULT_CONTACT_ID,
      }, authUser?.email);
    } catch {
      // Non-fatal — the site link itself already succeeded.
    }
  }

  async function handleUnlink() {
    setSaving(true);
    try {
      await removeUnifiLink(customerId);
      setLink(null);
      setDevices([]);
      setTopology(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unlink");
    } finally {
      setSaving(false);
    }
  }

  if (state === "unconfigured") return null;

  const linkedSite = link ? sites.find((s) => s.siteId === link.siteId) : undefined;

  return (
    <div className={bare ? "" : "bg-white border border-[#eaeaea] rounded-xl mb-6"}>
      <div className={`flex items-center justify-between px-5 py-4 ${bare ? "" : "border-b border-[#eaeaea]"}`}>
        {bare ? <div /> : (
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-[#0070f3]" />
            <p className="text-sm font-semibold text-[#0a0a0a]">Network (UniFi)</p>
          </div>
        )}
        {state === "ok" && link && linkedSite && (
          <div className="flex items-center gap-2">
            <a
              href={`https://unifi.ui.com/consoles/${linkedSite.hostId}/network/default/dashboard`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[#0070f3] hover:text-[#0051cc] transition-colors font-medium"
            >
              <ExternalLink className="w-3 h-3" />
              Open in UniFi
            </a>
            <Link
              href={`/sites/${linkedSite.siteId}`}
              className="flex items-center gap-1.5 text-xs text-[#666] hover:text-[#0a0a0a] border border-[#eaeaea] px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Full site view
            </Link>
            <button
              onClick={handleUnlink}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs text-[#999] hover:text-[#dc2626] transition-colors disabled:opacity-40"
              title="Unlink this UniFi site"
            >
              <Unlink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {state === "loading" && (
        <div className="flex items-center justify-center py-12 text-sm text-[#999]">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          Loading network…
        </div>
      )}

      {state === "error" && (
        <div className="py-10 text-center">
          <AlertCircle className="w-5 h-5 text-[#ef4444] mx-auto mb-2" />
          <p className="text-xs text-[#999] mb-3">{error}</p>
          <button onClick={load} className="text-xs text-[#0070f3] hover:underline">Retry</button>
        </div>
      )}

      {state === "ok" && !link && (
        <div className="py-10 text-center px-5">
          <Server className="w-5 h-5 text-[#ddd] mx-auto mb-2" />
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">No UniFi site linked</p>
          <p className="text-xs text-[#999] mb-4">Link this customer to a UniFi site to see its network topology and devices.</p>
          <button
            onClick={() => setPickerOpen(true)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-[#0070f3] hover:bg-[#0051cc] px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Link2 className="w-3.5 h-3.5" />
            Link UniFi Site
          </button>
        </div>
      )}

      {state === "ok" && link && !linkedSite && (
        <div className="py-10 text-center px-5">
          <AlertCircle className="w-5 h-5 text-[#f5a524] mx-auto mb-2" />
          <p className="text-sm font-medium text-[#0a0a0a] mb-1">Linked site not found</p>
          <p className="text-xs text-[#999] mb-4">
            {link.siteName ?? link.siteId} may have been removed from UniFi Site Manager.
          </p>
          <button
            onClick={() => setPickerOpen(true)}
            className="text-xs text-[#0070f3] hover:underline font-medium"
          >
            Re-link a site
          </button>
        </div>
      )}

      {state === "ok" && link && linkedSite && (
        <div>
          {/* Status row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 border-b border-[#f2f2f2]">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${linkedSite.connected ? "bg-[#22c55e]" : "bg-[#9ca3af]"}`} />
              <span className={`text-sm font-medium ${linkedSite.connected ? "text-[#16a34a]" : "text-[#6b7280]"}`}>
                {linkedSite.connected ? "Online" : "Offline"}
              </span>
            </div>
            <div className="text-xs text-[#666]">
              <span className="text-[#999]">Gateway </span>{linkedSite.hardware.name || linkedSite.hardware.shortname}
            </div>
            {linkedSite.wans.length > 0 ? (
              linkedSite.wans.slice(0, 2).map((w) => w.ispName && (
                <div key={w.key} className="flex items-center gap-1.5 text-xs text-[#666]">
                  <IspLogo ispName={w.ispName} size={14} />
                  {w.ispName}
                  {linkedSite.wans.length > 1 && (
                    <span className="text-[9px] text-[#bbb] uppercase font-medium">{w.label}</span>
                  )}
                </div>
              ))
            ) : linkedSite.ispName && (
              <div className="flex items-center gap-1.5 text-xs text-[#666]">
                <IspLogo ispName={linkedSite.ispName} size={14} />
                {linkedSite.ispName}
              </div>
            )}
            {linkedSite.wanUptime != null && (
              <div className="text-xs text-[#666]">
                <span className="text-[#999]">WAN Uptime </span>{linkedSite.wanUptime.toFixed(2)}%
              </div>
            )}
            {linkedSite.statistics.counts.criticalNotification > 0 && (
              <div className="flex items-center gap-1 text-xs font-medium text-[#d97706]">
                <AlertCircle className="w-3 h-3" />
                {linkedSite.statistics.counts.criticalNotification} active alert{linkedSite.statistics.counts.criticalNotification > 1 ? "s" : ""}
              </div>
            )}
          </div>

          {/* Topology */}
          <div className="px-5 border-b border-[#f2f2f2] h-105">
            <ZoomPan>
              {topology?.available ? (
                <RealTopology
                  devices={topology.devices}
                  clients={topology.clients}
                  gatewayMac={linkedSite.mac}
                  ispName={linkedSite.ispName}
                  wanCount={linkedSite.wans.length}
                />
              ) : (
                <SiteTopology devices={devices} />
              )}
            </ZoomPan>
          </div>

          {/* Devices table */}
          <div>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f2f2f2]">
              <p className="text-sm font-semibold text-[#111]">Devices ({devices.length})</p>
            </div>
            {devices.length === 0 ? (
              <p className="text-sm text-[#999] px-5 py-6 text-center">No device data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-160">
                  <thead>
                    <tr className="border-b border-[#eaeaea]">
                      {["Name", "Model", "IP Address", "MAC Address", "Version", "Status"].map((h) => (
                        <th key={h} className="text-left text-[10px] font-semibold text-[#999] uppercase tracking-wider px-5 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => {
                      const online = d.status === "online" || d.status === "connected";
                      return (
                        <tr key={d.id} className="border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                          <td className="px-5 py-3 text-sm font-medium text-[#0a0a0a]">{d.name || "-"}</td>
                          <td className="px-5 py-3 text-sm text-[#666]">{d.model || "-"}</td>
                          <td className="px-5 py-3 text-sm text-[#666] font-mono">{d.ip || "-"}</td>
                          <td className="px-5 py-3 text-sm text-[#666] font-mono">{d.mac ? d.mac.toUpperCase() : "-"}</td>
                          <td className="px-5 py-3 text-sm text-[#666] font-mono">{d.version || "-"}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${online ? "bg-[#e8fdf0] text-[#17c964]" : "bg-[#fdeaea] text-[#f31260]"}`}>
                              {online ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {online ? "Online" : "Offline"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {pickerOpen && (
        <SitePicker
          sites={sites}
          companyName={companyName}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
