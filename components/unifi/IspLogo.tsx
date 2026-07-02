"use client";

import { useState } from "react";

// Maps ISP name fragments → local filename in /public/isp-logos/
// File can be .png, .svg, .jpg — try the path you drop in
const LOCAL_MAP: [string, string][] = [
  ["spectrum",    "spectrum"],
  ["charter",     "spectrum"],
  ["lytwave",     "lytwave"],
  ["lytewave",    "lytwave"],
  ["at&t",        "att"],
  ["att ",        "att"],
  ["t-mobile",    "tmobile"],
  ["tmobile",     "tmobile"],
  ["verizon",     "verizon"],
  ["comcast",     "comcast"],
  ["xfinity",     "xfinity"],
  ["cox ",        "cox"],
  ["centurylink", "centurylink"],
  ["frontier",    "frontier"],
  ["starlink",    "starlink"],
];

// Maps ISP name fragments → Clearbit domain (fallback)
const CLEARBIT_MAP: [string, string][] = [
  ["at&t",        "att.com"],
  ["att ",        "att.com"],
  ["comcast",     "comcast.com"],
  ["xfinity",     "xfinity.com"],
  ["verizon",     "verizon.com"],
  ["spectrum",    "spectrum.com"],
  ["charter",     "charter.com"],
  ["cox ",        "cox.com"],
  ["centurylink", "centurylink.com"],
  ["lumen",       "lumen.com"],
  ["frontier",    "frontier.com"],
  ["t-mobile",    "t-mobile.com"],
  ["tmobile",     "t-mobile.com"],
  ["optimum",     "optimum.com"],
  ["altice",      "altice.net"],
  ["starlink",    "starlink.com"],
  ["spacex",      "starlink.com"],
  ["google fiber","fiber.google.com"],
  ["windstream",  "windstream.com"],
  ["astound",     "astound.com"],
  ["mediacom",    "mediacom.com"],
  ["brightspeed", "brightspeed.com"],
  ["breezeline",  "breezeline.com"],
  ["earthlink",   "earthlink.net"],
  ["rcn",         "rcn.com"],
  ["wow!",        "wowway.com"],
  ["wowway",      "wowway.com"],
  ["lytwave",     "lytwave.com"],
  ["lytewave",    "lytwave.com"],
  ["ziply",       "ziplyfiber.com"],
  ["sonic",       "sonic.com"],
  ["kinetic",     "windstream.com"],
  ["sparklight",  "sparklight.com"],
  ["cable one",   "sparklight.com"],
  ["metronet",    "metronet.com"],
  ["fidium",      "fidiumfiber.com"],
];

function getLocalKey(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, file] of LOCAL_MAP) {
    if (lower.includes(key)) return file;
  }
  return null;
}

function getClearbitDomain(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, domain] of CLEARBIT_MAP) {
    if (lower.includes(key)) return domain;
  }
  // Single-word name guess
  const words = lower.trim().split(/\s+/);
  if (words.length === 1 && words[0].length > 3) return `${words[0]}.com`;
  return null;
}

const AVATAR_COLORS: [string, string][] = [
  ["#dbeafe", "#1d4ed8"], ["#ede9fe", "#6d28d9"],
  ["#dcfce7", "#15803d"], ["#fef9c3", "#a16207"],
  ["#fee2e2", "#b91c1c"], ["#cffafe", "#0e7490"],
  ["#fce7f3", "#be185d"], ["#ffedd5", "#c2410c"],
];
function avatarColor(name: string): [string, string] {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Per-ISP scale factor to compensate for logos with extra whitespace
const SCALE_MAP: [string, number][] = [
  ["at&t",   1.35],
  ["att ",   1.35],
];

function getScale(name: string): number {
  const lower = name.toLowerCase();
  for (const [key, scale] of SCALE_MAP) {
    if (lower.includes(key)) return scale;
  }
  return 1;
}

// Extensions to try for local files
const EXTS = ["png", "svg", "jpg", "webp"];

interface IspLogoProps {
  ispName: string;
  size?: number;
  className?: string;
}

export default function IspLogo({ ispName, size = 20, className = "" }: IspLogoProps) {
  const localKey       = getLocalKey(ispName);
  const clearbitDomain = getClearbitDomain(ispName);
  const displaySize    = Math.round(size * getScale(ispName));

  // Build ordered list of URLs to try
  const srcs: string[] = [
    // Local files first (try common extensions)
    ...(localKey ? EXTS.map((ext) => `/isp-logos/${localKey}.${ext}`) : []),
    // Clearbit fallback
    ...(clearbitDomain ? [`https://logo.clearbit.com/${clearbitDomain}?size=${displaySize * 2}`] : []),
  ];

  const [idx, setIdx] = useState(0);

  const advance = () => setIdx((i) => i + 1);

  const [bg, fg] = avatarColor(ispName);
  const letter = ispName.trim()[0]?.toUpperCase() ?? "?";

  // All sources exhausted — show blue globe icon
  if (srcs.length === 0 || idx >= srcs.length) {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title={ispName}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0ea5e9"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: size, height: size }}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </span>
    );
  }

  return (
    <img
      key={srcs[idx]}
      src={srcs[idx]}
      alt={ispName}
      width={displaySize}
      height={displaySize}
      className={`rounded object-contain shrink-0 ${className}`}
      style={{ width: displaySize, height: displaySize }}
      onError={advance}
      title={ispName}
    />
  );
}
