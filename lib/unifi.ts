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
    wans?: Record<string, { externalIp?: string; wanUptime?: number; wanIssues?: UiIssuePeriod[] }>;
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
    hardware: {
      shortname: string;
      name: string;
      mac: string;
      serialno: string;
      firmwareVersion?: string;
    };
    location?: { text?: string; lat?: number; long?: number };
    internetIssues5min?: { periods: UiIssuePeriod[] };
    wans?: Array<{ ipv4?: string; type?: string; interface?: string; enabled?: boolean }>;
    controllers?: Array<{ name: string; version?: string; uiVersion?: string; state?: string }>;
    timezone?: string;
  };
}

// ─── Merged type used in UI ─────────────────────────────────────────────────
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
}

// ─── API calls ──────────────────────────────────────────────────────────────
export async function getSites(): Promise<{ data: UiSite[] }> {
  return uiApi<{ data: UiSite[] }>("/ea/sites?pageSize=200");
}

export async function getHosts(): Promise<{ data: UiHost[] }> {
  return uiApi<{ data: UiHost[] }>("/ea/hosts?pageSize=200");
}

export async function getSiteDevices(siteId: string): Promise<{ data: UiDevice[] }> {
  return uiApi<{ data: UiDevice[] }>(`/ea/sites/${siteId}/devices?pageSize=200`);
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
  type?: string;
  status?: string;
  ip?: string;
  uptime?: number;
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
