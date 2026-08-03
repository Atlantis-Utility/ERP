import { withCache } from "./server-cache";

const BASE_URL = "https://api.ui.com";
const API_KEY = process.env.UNIFI_API_KEY;
const UI_TTL = 30_000; // 30 seconds — network status changes quickly

export function isConfigured(): boolean {
  return Boolean(API_KEY && API_KEY !== "your_unifi_api_key_here");
}

async function uiApi<T>(path: string): Promise<T> {
  if (!isConfigured()) throw new Error("UNIFI_NOT_CONFIGURED");
  return withCache(`ui:${path}`, UI_TTL, async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { "x-api-key": API_KEY!, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`UniFi ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json() as T;
  });
}

// ─── Site types (from /ea/sites) ───────────────────────────────────────────
export interface UiSiteCounts {
  totalDevice: number;
  offlineDevice: number;
  gatewayDevice: number;
  wifiDevice: number;
  wiredDevice: number;
  wifiClient: number;
  wiredClient: number;
  guestClient: number;
  criticalNotification: number;
  pendingUpdateDevice: number;
  offlineWifiDevice: number;
  offlineWiredDevice: number;
}

export interface UiSite {
  siteId: string;
  hostId: string;
  statistics: {
    counts: UiSiteCounts;
    gateway?: { shortname: string; ipsMode?: string };
    ispInfo?: { name?: string; organization?: string; asn?: number };
    percentages?: { wanUptime?: number; txRetry?: number };
    wans?: Record<string, {
      externalIp?: string;
      wanUptime?: number;
      wanIssues?: UiIssuePeriod[];
      ispInfo?: { name?: string; organization?: string; asn?: number };
    }>;
    internetIssues?: UiIssuePeriod[];
  };
  permission?: string;
}

// ─── Host types (from /ea/hosts) ───────────────────────────────────────────
export interface UiIssuePeriod {
  index: number;
  count?: number;        // API compresses consecutive identical periods; expand when building bar
  wanDowntime?: boolean;
  notReported?: boolean;
  highLatency?: boolean;
  packetLoss?: boolean;
  packetLossPct?: number; // raw 0–100 value, when the source has it — drives the packet-loss line graph
  latencyAvgMs?: number;
  latencyMaxMs?: number;
}

export interface UiHost {
  id: string;
  hardwareId: string;
  type: string;
  ipAddress: string;
  isBlocked: boolean;
  reportedState: {
    name: string;
    hostname: string;
    state: string; // "connected" | "disconnected"
    ip: string;
    version?: string; // console/UniFi OS version
    hardware: {
      shortname: string;
      name: string;
      mac: string;
      serialno: string;
      firmwareVersion?: string;
    };
    location?: { text?: string; lat?: number; long?: number };
    ipAddrs?: string[]; // includes the LAN gateway IP alongside link-local/WAN addresses
    internetIssues5min?: { periods: UiIssuePeriod[] };
    // `type` here is the WAN role/interface label (e.g. "WAN", "WAN2"), NOT
    // the IP assignment method — the Site Manager API does not expose
    // static-vs-DHCP configuration, only runtime WAN state.
    wans?: Array<{ ipv4?: string; type?: string; interface?: string; enabled?: boolean }>;
    controllers?: Array<{ name: string; version?: string; uiVersion?: string; state?: string }>;
    timezone?: string;
  };
}

// ─── Merged type used in UI ─────────────────────────────────────────────────
export interface UiEnrichedWan {
  key: string;          // "WAN", "WAN2", ...
  label: string;        // "Primary" | "Secondary" | key
  ipv4: string;
  ispName: string;
  ispOrganization: string;
  asn: number | null;
  wanUptime: number | null;
  // Estimated from the WAN IP's reverse-DNS hostname — UniFi's API has no
  // static-vs-DHCP field. "unknown" is expected whenever the ISP doesn't
  // label its PTR records this way, not a failure.
  ipType: "static" | "dynamic" | "unknown";
  ipTypeHostname?: string;
}

export interface UiEnrichedSite extends UiSite {
  displayName: string;
  connected: boolean;
  wanUptime: number | null; // 0–100 percentage over the stats window; null if unavailable
  hardware: { shortname: string; name: string };
  location: string;
  wanIp: string;
  ispName: string;
  internetIssues: UiIssuePeriod[];
  firmwareVersion: string;
  wans: UiEnrichedWan[];   // every WAN/ISP reported for the site (primary + failover)
  mac: string;
  serialNumber: string;
  timezone: string;
  osVersion: string;
  lanIp: string; // gateway's LAN-facing IP, e.g. 192.168.1.1
}

// ─── API calls ──────────────────────────────────────────────────────────────
export async function getSites(): Promise<{ data: UiSite[] }> {
  return uiApi<{ data: UiSite[] }>("/ea/sites?pageSize=200");
}

export async function getHosts(): Promise<{ data: UiHost[] }> {
  return uiApi<{ data: UiHost[] }>("/ea/hosts?pageSize=200");
}

// ─── ISP metrics (continuous per-5-min WAN telemetry) ──────────────────────
// `site.statistics.internetIssues` / `host.reportedState.internetIssues5min`
// are a SPARSE anomaly log — only periods with a flagged issue are present,
// so a perfectly healthy site has zero entries there even during the last 6
// hours (which is why the chart showed "no data" for clean sites). This
// endpoint instead returns one entry per site with a genuinely continuous
// ~24h/5-min series (avg/max latency, packet loss, downtime for every
// interval), matching what UniFi's own dashboard graphs. Its `siteId`/
// `hostIds` filter params are ignored server-side (same quirk as
// `/ea/devices`), so fetch once and match client-side.
export interface UiIspMetricPeriod {
  metricTime: string;
  data?: {
    wan?: {
      avgLatency?: number;
      maxLatency?: number;
      packetLoss?: number;
      downtime?: number;
      uptime?: number;
    };
  };
}

export interface UiIspMetricsEntry {
  hostId: string;
  siteId: string;
  periods: UiIspMetricPeriod[];
}

export async function getIspMetrics(): Promise<{ data: UiIspMetricsEntry[] }> {
  return uiApi<{ data: UiIspMetricsEntry[] }>("/ea/isp-metrics/5m?pageSize=200");
}

// Converts a continuous isp-metrics period series into the sparse
// `UiIssuePeriod` shape the existing chart/health-bar components consume, so
// they work unchanged regardless of which source fed them.
export function ispMetricsToIssuePeriods(periods: UiIspMetricPeriod[]): UiIssuePeriod[] {
  return periods.map((p) => {
    const wan = p.data?.wan;
    const avg = wan?.avgLatency;
    const uptime = wan?.uptime;
    return {
      index: Math.floor(new Date(p.metricTime).getTime() / 1000 / 300),
      latencyAvgMs: avg,
      latencyMaxMs: wan?.maxLatency,
      packetLoss: (wan?.packetLoss ?? 0) > 0,
      packetLossPct: wan?.packetLoss,
      wanDowntime: (wan?.downtime ?? 0) > 0 || (uptime !== undefined && uptime < 100),
      highLatency: avg !== undefined && avg > 50,
    };
  });
}

// The Site Manager API has no `/ea/sites/{siteId}/devices` endpoint (404) —
// devices are only exposed via `/ea/devices`, grouped by *host* (one entry
// per adopted console, e.g. `{ hostId, hostName, devices: [...] }`), and it
// ignores `siteId`/`hostIds` filter params, always returning every host. So
// this fetches the full (cached) set and filters down to the one host tied
// to the requested site.
export async function getAllHostDevices(): Promise<{ data: UiHostDevices[] }> {
  return uiApi<{ data: UiHostDevices[] }>("/ea/devices?pageSize=200");
}

export async function getSiteDevices(siteId: string): Promise<{ data: UiDevice[] }> {
  const [sitesRes, hostDevicesRes] = await Promise.all([getSites(), getAllHostDevices()]);
  const site = sitesRes.data.find((s) => s.siteId === siteId);
  if (!site) return { data: [] };
  const group = hostDevicesRes.data.find((h) => h.hostId === site.hostId);
  return { data: group?.devices ?? [] };
}

export async function getSiteAlerts(siteId: string): Promise<{ data: UiAlert[] }> {
  return uiApi<{ data: UiAlert[] }>(`/ea/sites/${siteId}/alerts?pageSize=200`);
}

export async function getSiteNotifications(siteId: string): Promise<{ data: UiAlert[] }> {
  return uiApi<{ data: UiAlert[] }>(`/ea/sites/${siteId}/notifications?pageSize=200`);
}

export async function getAllAlerts(): Promise<{ data: UiAlert[] }> {
  return uiApi<{ data: UiAlert[] }>("/ea/alerts?pageSize=200");
}

export async function getAllNotifications(): Promise<{ data: UiAlert[] }> {
  return uiApi<{ data: UiAlert[] }>("/ea/notifications?pageSize=200");
}

export interface UiDevice {
  id: string;
  name?: string;
  mac?: string;
  model?: string;
  shortname?: string;
  productLine?: "network" | "protect" | "access" | string;
  type?: string;
  status?: string;
  ip?: string;
  uptime?: number;
  version?: string;
  firmwareStatus?: string;
  updateAvailable?: string;
  isConsole?: boolean;
  isManaged?: boolean;
  adoptionTime?: string;
  startupTime?: string; // ISO timestamp of last boot — use to derive system uptime
  note?: string;
}

export interface UiHostDevices {
  hostId: string;
  hostName: string;
  devices: UiDevice[];
  updatedAt?: string;
}

export interface UiAlert {
  id: string;
  type?: string;
  severity?: string;
  message?: string;
  created_at?: string;
  resolved_at?: string | null;
  site_id?: string;
  siteName?: string; // enriched by API route
}

// ─── Network Integration API (Cloud Connector Proxy) ───────────────────────
// A separate, per-console API reached via
// /v1/connector/consoles/{hostId}/proxy/network/integration/v1/... — it
// returns real per-client uplink data (which switch/AP a client is attached
// to), unlike the /ea/* Site Manager endpoints above. UniFi only allows this
// proxy for consoles the API key's account directly *owns*; for sites shared
// via Cloud Access (the normal way an MSP manages a customer's console) it
// returns 403 "user is not the owner of this host". Always check
// `available` on the result rather than assuming this works for every site.
export interface UiConnectorSite {
  id: string;               // internal site UUID, distinct from the Site Manager `siteId`
  internalReference?: string;
  name: string;
}

export interface UiConnectorDevice {
  id: string;
  macAddress: string;
  ipAddress?: string;
  name: string;
  model: string;
  state: string; // "ONLINE" | "OFFLINE" | ...
  firmwareVersion?: string;
  firmwareUpdatable?: boolean;
}

export interface UiConnectorClient {
  id: string;
  type: "WIRED" | "WIRELESS" | string;
  name: string;
  connectedAt?: string;
  ipAddress?: string;
  macAddress: string;
  uplinkDeviceId?: string; // references UiConnectorDevice.id — may reference a device no longer present
}

export interface UiRealTopology {
  available: boolean;
  devices: UiConnectorDevice[];
  clients: UiConnectorClient[];
}

async function getConnectorSites(hostId: string): Promise<{ data: UiConnectorSite[] }> {
  return uiApi(`/v1/connector/consoles/${hostId}/proxy/network/integration/v1/sites`);
}

async function getConnectorDevices(hostId: string, intSiteId: string): Promise<{ data: UiConnectorDevice[] }> {
  return uiApi(`/v1/connector/consoles/${hostId}/proxy/network/integration/v1/sites/${intSiteId}/devices`);
}

async function getConnectorClients(hostId: string, intSiteId: string): Promise<{ data: UiConnectorClient[] }> {
  return uiApi(`/v1/connector/consoles/${hostId}/proxy/network/integration/v1/sites/${intSiteId}/clients`);
}

export async function getRealTopology(hostId: string): Promise<UiRealTopology> {
  try {
    const sitesRes = await getConnectorSites(hostId);
    const intSite = sitesRes.data?.[0];
    if (!intSite) return { available: false, devices: [], clients: [] };

    const [devicesRes, clientsRes] = await Promise.all([
      getConnectorDevices(hostId, intSite.id),
      getConnectorClients(hostId, intSite.id),
    ]);
    return { available: true, devices: devicesRes.data ?? [], clients: clientsRes.data ?? [] };
  } catch {
    // Most sites are managed via Cloud Access rather than owned outright, so
    // a 403/failure here is the expected common case, not an error to surface.
    return { available: false, devices: [], clients: [] };
  }
}
