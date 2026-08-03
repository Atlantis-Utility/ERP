"use client";

import { Router } from "lucide-react";
import IspLogo from "@/components/unifi/IspLogo";
import ClientIcon from "@/components/unifi/ClientIcon";
import DeviceLogo from "@/components/unifi/DeviceLogo";
import type { UiConnectorDevice, UiConnectorClient } from "@/lib/unifi";

// Wired links get a bolder, more saturated solid line — a confident, real
// connection. Wireless links get a lighter, thinner dashed line — present,
// but visibly a step down in certainty. Matches the wired/dashed contrast in
// UniFi's own topology diagrams instead of one flat neutral grey for both.
const WIRED_LINE = "#3b6fe0";
const WIRELESS_LINE = "#a9c2ef";

// Junction dot at a branch point, mirroring UniFi's own topology diagrams.
function JunctionDot() {
  return (
    <div className="w-3 h-3 rounded-full bg-[#2f6fed] flex items-center justify-center shrink-0 z-10">
      <div className="w-1.5 h-px bg-white" />
    </div>
  );
}

function Stem({ wireless, height = 16 }: { wireless?: boolean; height?: number }) {
  return wireless ? (
    <div style={{ height, borderLeft: `1.5px dashed ${WIRELESS_LINE}` }} />
  ) : (
    <div style={{ height, width: 2, background: WIRED_LINE }} />
  );
}

// Lays out a parent stem down to a junction dot, then (for >1 child) a
// horizontal bus spanning exactly the children's content width, with each
// child dropping its own stem from the bus — matching UniFi's own topology
// rendering instead of a diagonal fan-out.
function Branch({
  children,
  wirelessFlags,
}: {
  children: React.ReactNode[];
  wirelessFlags: boolean[];
}) {
  if (children.length === 0) return null;
  if (children.length === 1) {
    return (
      <div className="flex flex-col items-center">
        <Stem wireless={wirelessFlags[0]} height={20} />
        {children[0]}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center">
      <div className="w-px h-4" style={{ background: WIRED_LINE }} />
      <JunctionDot />
      {/* Each child gets its own cap segment off the trunk, styled to match
          its own stem below (solid for wired, dashed for wireless) — a mixed
          tier (e.g. a wired switch alongside wireless clients) reads
          correctly instead of one uniform bar implying they're all the same
          kind of connection. */}
      <div className="inline-flex">
        {children.map((child, i) => (
          <div
            key={i}
            className="flex flex-col items-center px-3"
            style={
              wirelessFlags[i]
                ? { borderTop: `1.5px dashed ${WIRELESS_LINE}` }
                : { borderTop: `2px solid ${WIRED_LINE}` }
            }
          >
            <Stem wireless={wirelessFlags[i]} />
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

// Plain floating photo + name — no card/border/background, matching UniFi's
// own topology diagram style. Falls back to a small icon (still unboxed) when
// no real photo is available for that client.
function ClientLeaf({ client }: { client: UiConnectorClient }) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-24 max-w-36">
      <ClientIcon name={client.name || client.macAddress} size={52} />
      <p className="text-[11px] font-medium text-[#333] text-center truncate max-w-36" title={client.name}>
        {client.name || client.macAddress}
      </p>
    </div>
  );
}

function DeviceNode({ device }: { device: UiConnectorDevice }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <DeviceLogo model={device.model} name={device.name} size={52} />
      <p className="text-[11px] font-medium text-[#333]">{device.name}</p>
    </div>
  );
}

// Recursively renders a device with whatever's hanging off it — its own
// directly-uplinked clients, plus (for a switch) any further devices nested
// under it. The API gives us client→device links but never device→device
// port wiring, so nesting APs under a same-site switch is a best-effort
// assumption based on the common real-world pattern, not a confirmed fact.
function DeviceBranch({
  device,
  clientsByDevice,
  nestedDevices,
}: {
  device: UiConnectorDevice;
  clientsByDevice: Map<string, UiConnectorClient[]>;
  nestedDevices: UiConnectorDevice[];
}) {
  const ownClients = clientsByDevice.get(device.id) ?? [];
  const childNodes: React.ReactNode[] = [
    ...ownClients.map((c) => <ClientLeaf key={c.id} client={c} />),
    ...nestedDevices.map((d) => (
      <DeviceBranch key={d.id} device={d} clientsByDevice={clientsByDevice} nestedDevices={[]} />
    )),
  ];
  const childWireless: boolean[] = [
    ...ownClients.map((c) => c.type === "WIRELESS"),
    ...nestedDevices.map(() => false),
  ];

  return (
    <div className="flex flex-col items-center">
      <DeviceNode device={device} />
      <Branch wirelessFlags={childWireless}>{childNodes}</Branch>
    </div>
  );
}

export default function RealTopology({
  devices,
  clients,
  gatewayMac,
  ispName,
  wanCount = 1,
}: {
  devices: UiConnectorDevice[];
  clients: UiConnectorClient[];
  gatewayMac: string;
  ispName?: string;
  wanCount?: number;
}) {
  if (devices.length === 0) {
    return <p className="text-xs text-[#999] text-center py-8">No topology data.</p>;
  }

  const normalizedGwMac = gatewayMac.toLowerCase().replace(/:/g, "");
  const gateway =
    devices.find((d) => d.macAddress.toLowerCase().replace(/:/g, "") === normalizedGwMac) ?? devices[0];
  const otherDevices = devices.filter((d) => d.id !== gateway.id);

  const deviceIds = new Set(devices.map((d) => d.id));
  const clientsByDevice = new Map<string, UiConnectorClient[]>();
  const orphanClients: UiConnectorClient[] = [];
  for (const c of clients) {
    if (c.uplinkDeviceId && deviceIds.has(c.uplinkDeviceId)) {
      const list = clientsByDevice.get(c.uplinkDeviceId) ?? [];
      list.push(c);
      clientsByDevice.set(c.uplinkDeviceId, list);
    } else {
      orphanClients.push(c);
    }
  }

  const gatewayClients = [...(clientsByDevice.get(gateway.id) ?? []), ...orphanClients];

  // Best-effort: if the site has a switch, assume the other devices (APs)
  // hang off it rather than off the gateway directly. But only nest devices
  // that actually have client data of their own — nesting a device with zero
  // clients under the switch implies a specific physical relationship we
  // can't verify anyway, and just adds a sibling "slot" that pushes real
  // branches further apart. Those instead sit alongside the switch itself.
  const switchDevice = otherDevices.find((d) => /^usw|switch/i.test(d.model));
  const nestingCandidates = switchDevice ? otherDevices.filter((d) => d.id !== switchDevice.id) : [];
  const devicesNestedUnderSwitch = nestingCandidates.filter((d) => (clientsByDevice.get(d.id)?.length ?? 0) > 0);
  const promotedDevices = switchDevice
    ? nestingCandidates.filter((d) => (clientsByDevice.get(d.id)?.length ?? 0) === 0)
    : otherDevices;
  const topLevelDevices = switchDevice ? [switchDevice, ...promotedDevices] : promotedDevices;

  const branchNodes: React.ReactNode[] = [
    ...gatewayClients.map((c) => <ClientLeaf key={c.id} client={c} />),
    ...topLevelDevices.map((d) => (
      <DeviceBranch
        key={d.id}
        device={d}
        clientsByDevice={clientsByDevice}
        nestedDevices={d.id === switchDevice?.id ? devicesNestedUnderSwitch : []}
      />
    )),
  ];
  const branchWireless: boolean[] = [
    ...gatewayClients.map((c) => c.type === "WIRELESS"),
    ...topLevelDevices.map(() => false),
  ];

  return (
    <div className="flex flex-col items-center py-6 w-fit">
      {wanCount > 1 && (
        <div className="flex items-center gap-1.5 text-[10px] text-[#999] mb-2">
          <Router className="w-3 h-3" />
          Multiple WANs
        </div>
      )}

      {ispName && (
        <>
          <div className="flex flex-col items-center gap-1">
            <IspLogo ispName={ispName} size={44} />
            <p className="text-[11px] text-[#888]">{ispName}</p>
          </div>
          <Stem height={20} />
        </>
      )}

      {/* Gateway (root) */}
      <div className="flex flex-col items-center gap-1.5">
        <DeviceLogo model={gateway.model} name={gateway.name} size={60} />
        <p className="text-[12px] font-semibold text-[#111]">{gateway.name}</p>
      </div>

      <Branch wirelessFlags={branchWireless}>{branchNodes}</Branch>
    </div>
  );
}
