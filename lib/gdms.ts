const API_ID = process.env.GDMS_API_ID;
const SECRET_KEY = process.env.GDMS_SECRET_KEY;
const DOMAIN = process.env.GDMS_DOMAIN || "www.gdms.cloud";

export function isConfigured(): boolean {
  return Boolean(API_ID && SECRET_KEY);
}

export interface GdmsOrganization {
  id: string;
  name: string;
}

export interface GdmsSite {
  id: string;
  name: string;
  organizationId: string;
}

export interface GdmsDevice {
  id: string;
  name: string;
  model: string;
  status: string;
  siteId: string;
}

// GDMS's developer portal only documents the onboarding flow (create account,
// apply for API developer access, base URL shape https://{domain}/oapi/{version}/...).
// The actual auth token exchange and organization/site/device list endpoints
// aren't wired up yet — swap this out once those specs are available.
export async function getOrganizations(): Promise<GdmsOrganization[]> {
  if (!isConfigured()) throw new Error("GDMS_NOT_CONFIGURED");
  throw new Error("GDMS_NOT_IMPLEMENTED");
}

export async function getSites(_organizationId: string): Promise<GdmsSite[]> {
  if (!isConfigured()) throw new Error("GDMS_NOT_CONFIGURED");
  throw new Error("GDMS_NOT_IMPLEMENTED");
}

export async function getDevices(_siteId: string): Promise<GdmsDevice[]> {
  if (!isConfigured()) throw new Error("GDMS_NOT_CONFIGURED");
  throw new Error("GDMS_NOT_IMPLEMENTED");
}

export function baseUrl(): string {
  return `https://${DOMAIN}/oapi`;
}
