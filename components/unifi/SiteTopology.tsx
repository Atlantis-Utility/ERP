"use client";

import { Network, Wifi, Camera, KeyRound, HelpCircle, Cloud } from "lucide-react";
import DeviceLogo from "@/components/unifi/DeviceLogo";
import type { UiDevice } from "@/lib/unifi";

// The Site Manager API has no port/uplink graph (no "connected to" edges) —
// so this renders a logical tier diagram (Internet → Gateway → device
// groups) derived from productLine + shortname, not a literal wiring map.
type DeviceGroup = "switch" | "ap" | "camera" | "access" | "other";

function categorize(d: UiDevice): DeviceGroup {
  if (d.productLine === "protect") return "camera";
  if (d.productLine === "access") return "access";
  if (d.shortname?.toUpperCase().startsWith("US")) return "switch";
  if (d.productLine === "network") return "ap";
  return "other";
}

const GROUP_META: Record<DeviceGroup, { label: string; icon: typeof Wifi }> = {
  switch: { label: "Switches", icon: Network },
  ap: { label: "Access Points", icon: Wifi },
  camera: { label: "Cameras", icon: Camera },
  access: { label: "Access Control", icon: KeyRound },
  other: { label: "Other Devices", icon: HelpCircle },
};

const GROUP_ORDER: DeviceGroup[] = ["switch", "ap", "camera", "access", "other"];

function isOnline(status?: string) {
  return status === "online" || status === "connected";
}

function DeviceChip({ device }: { device: UiDevice }) {
  const online = isOnline(device.status);
  return (
    <div className="flex items-center gap-2 bg-white border border-[#eaeaea] rounded-lg px-2.5 py-1.5 min-w-0">
      <div className="w-7 h-7 rounded-md bg-[#fafafa] border border-[#f0f0f0] flex items-center justify-center shrink-0 relative">
        <DeviceLogo model={device.model} shortname={device.shortname} name={device.name} size={18} />
        <span className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-white ${online ? "bg-[#22c55e]" : "bg-[#dc2626]"}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-[#111] truncate max-w-40">{device.name || device.model || "Device"}</p>
        <p className="text-[9px] text-[#aaa] truncate max-w-40">{device.model}{device.ip ? ` · ${device.ip}` : ""}</p>
      </div>
    </div>
  );
}

export default function SiteTopology({ devices }: { devices: UiDevice[] }) {
  const gateway = devices.find((d) => d.isConsole) ?? devices[0];
  const rest = devices.filter((d) => d.id !== gateway?.id);

  const groups = GROUP_ORDER.map((g) => ({
    group: g,
    devices: rest.filter((d) => categorize(d) === g),
  })).filter((g) => g.devices.length > 0);

  if (!gateway) {
    return <p className="text-xs text-[#999] text-center py-8">No devices to map.</p>;
  }

  const gwOnline = isOnline(gateway.status);

  return (
    <div className="flex flex-col items-center py-4">
      {/* Internet */}
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#999] uppercase tracking-wide">
        <Cloud className="w-3.5 h-3.5" />
        Internet
      </div>
      <div className="w-px h-5 bg-[#e0e0e0]" />

      {/* Gateway (root) */}
      <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 shadow-sm ${gwOnline ? "border-[#c7f0d8] bg-[#f0fdf4]" : "border-[#fecaca] bg-[#fef2f2]"}`}>
        <DeviceLogo model={gateway.model} shortname={gateway.shortname} name={gateway.name} size={22} />
        <div>
          <p className="text-[12px] font-semibold text-[#111] leading-tight">{gateway.name || gateway.model || "Gateway"}</p>
          <p className="text-[10px] text-[#888]">{gateway.model}</p>
        </div>
        <span className={`w-1.5 h-1.5 rounded-full ${gwOnline ? "bg-[#22c55e]" : "bg-[#dc2626]"}`} />
      </div>

      {groups.length > 0 && <div className="w-px h-5 bg-[#e0e0e0]" />}

      {/* Device groups */}
      {groups.length > 0 && (
        <div className="w-full flex flex-col gap-4">
          {groups.length > 1 && (
            <div className="hidden sm:block h-px bg-[#e0e0e0] mx-auto" style={{ width: `${100 - 100 / groups.length}%` }} />
          )}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
            {groups.map(({ group, devices: gDevices }) => {
              const meta = GROUP_META[group];
              const Icon = meta.icon;
              return (
                <div key={group} className="flex flex-col items-center gap-2">
                  <div className="w-px h-4 bg-[#e0e0e0] sm:block hidden" />
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#666] uppercase tracking-wide">
                    <Icon className="w-3 h-3" />
                    {meta.label}
                    <span className="text-[#bbb] font-normal normal-case">({gDevices.length})</span>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5 max-w-80">
                    {gDevices.map((d) => (
                      <DeviceChip key={d.id} device={d} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
