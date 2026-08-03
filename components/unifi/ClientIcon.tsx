"use client";

import { useState } from "react";
import { Printer, Phone, Camera, Smartphone, Monitor, Server, HelpCircle } from "lucide-react";

// Maps name fragments → local filename in /public/device-logos/ (checked first).
// Drop a matching file in that folder (png/svg/jpg/webp) to override the
// generic brand-logo fallback with an exact product photo. Ranked here by how
// often each pattern actually shows up across our real UniFi sites (see
// AGENTS notes / conversation — Yealink desk phones and the W70B cordless
// handset dominate by a wide margin).
const LOCAL_MAP: [string, string][] = [
  ["sip-t54w",   "yealink-t54w"],
  ["sip-t53w",   "yealink-t53w"],
  ["sip-t53",    "yealink-t53w"],   // T53 (non-W) shares the same body as T53W
  ["sip-t46s",   "yealink-t46s"],
  ["sip-t41s",   "yealink-t41s"],
  ["sip-t34w",   "yealink-t34w"],
  ["w70b",       "yealink-w70b"],
  ["ring-",      "ring-camera"],
  ["ring spotlight cam", "ring-camera"],
  ["ring doorbell",      "ring-doorbell"],
  ["unraid",     "unraid"],
];

// Maps name fragments → Clearbit domain (brand-logo fallback)
const CLEARBIT_MAP: [string, string][] = [
  ["yealink",     "yealink.com"],
  ["sip-t",       "yealink.com"],
  ["polycom",     "poly.com"],
  ["grandstream", "grandstream.com"],
  ["cisco",       "cisco.com"],
  ["canon",       "usa.canon.com"],
  ["brother",     "brother.com"],
  ["epson",       "epson.com"],
  ["lexmark",     "lexmark.com"],
  ["kyocera",     "kyocera.com"],
  ["xerox",       "xerox.com"],
  ["hp ",         "hp.com"],
  ["unraid",      "unraid.net"],
  ["synology",    "synology.com"],
  ["hikvision",   "hikvision.com"],
  ["dahua",       "dahuasecurity.com"],
  ["reolink",     "reolink.com"],
  ["ring-",       "ring.com"],
  ["ring spotlight", "ring.com"],
  ["ring doorbell",  "ring.com"],
  ["axis-",       "axis.com"],
  ["mobotix",     "mobotix.com"],
  ["ajax nvr",    "ajax.systems"],
  ["sonos",       "sonos.com"],
  ["roku",        "roku.com"],
  ["chromecast",  "google.com"],
  ["nest",        "google.com"],
  ["echo",        "amazon.com"],
  ["firetv",      "amazon.com"],
  ["samsung",     "samsung.com"],
  ["hisense",     "hisense.com"],
  ["sony",        "sony.com"],
  ["vizio",       "vizio.com"],
  ["insignia",    "bestbuy.com"],
  ["wattbox",     "snapav.com"],
  ["netbotz",     "apc.com"],
  ["eufy",        "eufy.com"],
  ["lg ",         "lg.com"],
  ["apple",       "apple.com"],
  ["iphone",      "apple.com"],
  ["macbook",     "apple.com"],
  ["ipad",        "apple.com"],
];

// Some device auto-names encode the brand only as a MAC-derived prefix, not a
// readable word (e.g. Brother printers show up as "BRW"/"BRN" + hex, HP
// printers as "HP" + hex) — handle those with prefix checks, not substring.
const PREFIX_CLEARBIT_MAP: [RegExp, string][] = [
  [/^hp[0-9a-f]{4,}/i, "hp.com"],
  [/^brw[0-9a-f]{6,}/i, "brother.com"],
  [/^brn[0-9a-f]{6,}/i, "brother.com"],
  [/^npi[0-9a-f]{4,}/i, "hp.com"], // "Network Printer Interface" auto-name, seen on HP printers here
];

function categoryIcon(name: string): typeof HelpCircle {
  const n = name.toLowerCase();
  if (/printer|\bnpi|canon|brother|\bhp[\s-]|^hp[0-9a-f]|^brw|^brn|epson|lexmark|kyocera|xerox/.test(n)) return Printer;
  if (/^sip-|yealink|polycom|grandstream|\bphone\b|w70b/.test(n)) return Phone;
  if (/camera|\bcam\b|ptz|hikvision|dahua|reolink|^ring-|ring spotlight|ring doorbell|axis-|mobotix|nvr|eufy/.test(n)) return Camera;
  if (/iphone|android|pixel|galaxy s|\bipad\b/.test(n)) return Smartphone;
  if (/\btv\b|firetv|appletv|roku|chromecast|hisense|vizio|bravia|qmc series|smarttv/.test(n)) return Monitor;
  if (/pc$|desktop|imac|macbook|laptop|unraid|nas\b/.test(n)) return Server;
  return HelpCircle;
}

function getLocalKey(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, file] of LOCAL_MAP) {
    if (lower.includes(key)) return file;
  }
  return null;
}

function getClearbitDomain(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [pattern, domain] of PREFIX_CLEARBIT_MAP) {
    if (pattern.test(lower)) return domain;
  }
  for (const [key, domain] of CLEARBIT_MAP) {
    if (lower.includes(key)) return domain;
  }
  return null;
}

const EXTS = ["png", "jpg", "webp", "svg"];

export default function ClientIcon({ name, size = 22 }: { name: string; size?: number }) {
  const localKey = getLocalKey(name);
  const clearbitDomain = getClearbitDomain(name);

  const srcs: string[] = [
    ...(localKey ? EXTS.map((ext) => `/device-logos/${localKey}.${ext}`) : []),
    ...(clearbitDomain ? [`https://logo.clearbit.com/${clearbitDomain}?size=${size * 2}`] : []),
  ];

  const [idx, setIdx] = useState(0);
  const Fallback = categoryIcon(name);

  if (srcs.length === 0 || idx >= srcs.length) {
    return <Fallback className="w-4 h-4 text-[#3b5bdb]" style={{ width: size * 0.7, height: size * 0.7 }} />;
  }

  return (
    <img
      key={srcs[idx]}
      src={srcs[idx]}
      alt={name}
      width={size}
      height={size}
      className="rounded object-contain shrink-0"
      style={{ width: size, height: size }}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
