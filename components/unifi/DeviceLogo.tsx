"use client";

import { useState } from "react";

type Category = "gateway" | "ap" | null;

// Maps model/hardware-name fragments → filename in /public/device-logos/
// (same folder the client-device photos live in). Most-specific pattern
// first — first match wins, so e.g. "Dream Machine Pro" must be checked
// before the bare "Dream Machine" fallback. Entries left in place even
// without a file yet (protect cameras, cloud key, access control, etc.) are
// scaffolding — drop a matching file in and it activates with no code change.
//
// "gateway" and "ap" entries carry a category: within those two families,
// same-family consoles/APs are visually close enough (small white router
// boxes; white puck-shaped APs) that if the exact model's photo is missing,
// falling back to another real photo from the same family beats a generic
// silhouette. Switches vary too much in form factor across models to do the
// same safely, so they're left as single-file-or-generic.
const LOCAL_MAP: [RegExp, string, Category][] = [
  // Consoles / gateways
  [/dream router|\budr7?\b/i,                   "udr.png",              "gateway"],
  [/dream machine special|udm.?se/i,            "udm-pro-se.png",       "gateway"],
  [/dream machine pro|udm.?pro/i,                "udm-pro-se.png",      "gateway"],
  [/dream machine|\budm\b/i,                     "udm-pro-se.png",      "gateway"],
  [/cloud gateway max|ucg.?max/i,                "ucg-max.png",         "gateway"],
  [/cloud gateway ultra|ucg.?ultra/i,            "ucg-ultra.png",       "gateway"],
  [/cloud gateway|\bucg\b/i,                     "ucg-max.png",         "gateway"],
  [/next-gen.*gateway.*pro|ngw.?pro|uxg.?pro/i,  "uxg-pro.png",         "gateway"],
  [/security gateway pro 4|usg.?pro.?4/i,        "usg-pro-4.png",       "gateway"],
  [/security gateway pro 8|usg.?pro.?8/i,        "usg-pro-8.png",       "gateway"],
  [/security gateway xg|usg.?xg/i,               "usg-xg.png",          "gateway"],
  [/security gateway|\busg\b/i,                  "usg.png",             "gateway"],
  [/building bridge|\bubb\b/i,                   "ubb.jpg",             null],

  // Switches — form factors differ too much across models to substitute safely
  [/switch pro 24|usw.?pro.?24/i,               "usw-pro-24-poe.png",   null],
  [/switch pro 48|usw.?pro.?48/i,               "usw-pro-48-poe.png",   null],
  [/switch pro 8|usw.?pro.?8/i,                 "usw-pro-8-poe.png",    null],
  [/switch aggregation pro/i,                   "usw-aggregation-pro.png", null],
  [/switch aggregation/i,                       "usw-aggregation.png", null],
  [/switch ultra|usw.?ultra/i,                  "usw-ultra-60w.png",   null],
  [/switch lite 8|usw.?lite.?8/i,               "usw-lite-8-poe.png",  null],
  [/switch lite 16|usw.?lite.?16/i,             "usw-lite-16-poe.png", null],
  [/switch flex mini|flex mini/i,               "usw-flex-mini.png",   null],
  [/switch flex/i,                              "usw-flex.png",        null],
  [/switch.*48.*poe|usw.*48.*poe/i,             "usw-48-poe.png",       null],
  [/switch.*24.*poe|usw.*24.*poe/i,             "usw-24-poe.png",       null],
  [/switch.*16.*poe|usw.*16.*poe/i,             "usw-16-poe.png",       null],
  [/switch.*8.*poe|usw.*8.*poe/i,               "usw-8-poe.png",        null],
  [/switch.?48|usw.?48/i,                       "usw-48.png",           null],
  [/switch.?24|usw.?24/i,                       "usw-24.png",           null],
  [/switch.?16|usw.?16/i,                       "usw-16.png",           null],
  [/switch.?8|usw.?8/i,                         "usw-8.png",            null],
  [/^us.?8\b/i,                                 "usw-8.png",            null], // legacy "US-8" naming, pre-USW rebrand
  [/usw|switch/i,                               "usw-24.png",           null],

  // Access points
  [/u6.?enterprise/i,                           "u6-enterprise.png",    "ap"],
  [/u6.?pro/i,                                  "u6-pro.png",           "ap"],
  [/u6.?lite/i,                                 "u6-lite.png",          "ap"],
  [/u6.?(lr|long.?range)/i,                     "u6-lr.png",            "ap"],
  [/u6.?(iw|in.?wall)/i,                        "u6-inwall.png",        "ap"],
  [/u6.?mesh/i,                                 "u6-mesh.png",          "ap"],
  [/u6\+|u6.?plus/i,                            "u6-plus.png",          "ap"],
  [/u6.?extender/i,                             "u6-extender.png",      "ap"],
  [/flex.?hd/i,                                 "ap-flexhd.png",        "ap"],
  [/nanohd/i,                                   "ap-nanohd.png",        "ap"],
  [/ac.?pro/i,                                  "ap-ac-pro.png",        "ap"],
  [/ac.?lite/i,                                 "ap-ac-lite.png",       "ap"],
  [/ac.?(lr|long.?range)/i,                     "ap-ac-lr.png",         "ap"],
  [/ac.?mesh/i,                                 "ap-ac-mesh.png",       "ap"],
  [/ac.?hd/i,                                   "ap-ac-hd.png",         "ap"],
  [/in.?wall/i,                                 "ap-inwall.png",        "ap"],
  [/^u\d|uap|access point|\bap\b/i,              "ap-generic.png",      "ap"],

  // Protect cameras
  [/g5.?dome/i,                                 "protect-g5-dome.png",  null],
  [/g4.?doorbell.?pro/i,                        "protect-g4-doorbell-pro.png", null],
  [/g4.?doorbell/i,                             "protect-g4-doorbell.png", null],
  [/g4.?bullet/i,                               "protect-g4-bullet.png", null],
  [/g4.?pro/i,                                  "protect-g4-pro.png",   null],
  [/g4.?dome/i,                                 "protect-g4-dome.png",  null],
  [/g3.?flex/i,                                 "protect-g3-flex.png",  null],
  [/g3.?bullet/i,                               "protect-g3-bullet.png", null],
  [/protect|camera/i,                           "protect-g3.png",       null],

  // NVR
  [/nvr.?pro/i,                                 "nvr-pro.png",          null],
  [/nvr/i,                                      "nvr.png",              null],

  // Access control
  [/access hub/i,                               "access-hub.png",       null],
  [/access pro/i,                               "access-pro.png",       null],
  [/access lite/i,                              "access-lite.png",      null],

  // Cloud Key
  [/cloud.?key.?gen.?2/i,                       "cloud-key-gen2.png",   null],
  [/cloud.?key/i,                               "cloud-key.png",        null],
];

// Real photos we actually have on disk for each family, ranked by preference —
// tried in order after the model's own ideal file, before giving up to the
// generic silhouette.
const GATEWAY_FALLBACKS = ["udr.png", "udm-pro-se.png", "ucg-max.png", "ucg-ultra.png"];
const AP_FALLBACKS = ["u6-mesh.png", "u6-pro.png", "u6-plus.png", "u6-lr.png"];

function getCandidates(...values: (string | undefined)[]): string[] {
  const text = values.filter(Boolean).join(" ");
  if (!text) return [];
  for (const [re, file, category] of LOCAL_MAP) {
    if (re.test(text)) {
      const fallbacks = category === "gateway" ? GATEWAY_FALLBACKS : category === "ap" ? AP_FALLBACKS : [];
      return [file, ...fallbacks.filter((f) => f !== file)];
    }
  }
  return [];
}

interface DeviceLogoProps {
  model?: string;
  shortname?: string;
  name?: string;
  size?: number;
  className?: string;
}

export default function DeviceLogo({ model, shortname, name, size = 24, className = "" }: DeviceLogoProps) {
  const candidates = getCandidates(model, shortname, name);
  const [idx, setIdx] = useState(0);

  if (candidates.length === 0 || idx >= candidates.length) {
    // Generic device silhouette — same visual language as IspLogo's globe fallback
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#999"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: size, height: size }}
        className={`shrink-0 ${className}`}
      >
        <rect x="3" y="7" width="18" height="10" rx="2" />
        <path d="M7 21h10M9 17v4M15 17v4" />
      </svg>
    );
  }

  return (
    <img
      key={candidates[idx]}
      src={`/device-logos/${candidates[idx]}`}
      alt={name || model || "Device"}
      width={size}
      height={size}
      className={`object-contain shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setIdx((i) => i + 1)}
      title={name || model}
    />
  );
}
