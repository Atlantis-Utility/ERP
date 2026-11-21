"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, AlertTriangle, RefreshCw, Link2, Unlink } from "lucide-react";
import { useConfirm } from "@/lib/confirm";

interface Connection {
  email: string;
  microsoftUpn: string;
  displayName: string;
  scopes: string;
  connectedAt: string;
  lastUsedAt: string | null;
  brokenReason: string | null;
}

/**
 * Connect this person's own Microsoft account.
 *
 * Deliberately on their own profile rather than in Settings: it is their
 * account, their consent, and nobody can do it on their behalf. The ERP
 * then sees exactly what they see in Teams - not what the company could
 * see, which would need a tenant-wide permission and a bill from Microsoft.
 */
export default function MicrosoftConnectionCard() {
  const params = useSearchParams();
  const confirm = useConfirm();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  // What the callback redirected back with, read once on mount.
  const [notice] = useState(() => {
    const ms = params.get("ms");
    if (ms === "connected") return { kind: "ok" as const, text: `Connected as ${params.get("as") || "your Microsoft account"}.` };
    if (ms === "error") return { kind: "bad" as const, text: params.get("reason") || "That didn't work." };
    return null;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/microsoft/status");
      const data = await res.json();
      setConnection(data.connection ?? null);
      setConfigured(data.configured !== false);
    } catch {
      setConnection(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDisconnect() {
    const ok = await confirm({
      title: "Disconnect Microsoft?",
      description: "The ERP will stop reading your Teams messages and calendar. Your Microsoft account itself isn't changed, and you can reconnect at any time.",
      confirmLabel: "Disconnect",
      variant: "danger",
    });
    if (!ok) return;
    setWorking(true);
    try {
      await fetch("/api/microsoft/status", { method: "DELETE" });
      await load();
    } finally {
      setWorking(false);
    }
  }

  const connected = Boolean(connection) && !connection?.brokenReason;

  return (
    <div className="bg-white border border-[#eaeaea] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="w-4 h-4 text-[#999]" />
        <p className="text-sm font-semibold text-[#0a0a0a]">Microsoft</p>
      </div>
      <p className="text-xs text-[#999] mb-4">
        Show your Teams messages and calendar here. You sign in at Microsoft — the ERP never sees your password,
        and it reads only what you can already see.
      </p>

      {notice && (
        <div
          className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg mb-3 ${
            notice.kind === "ok"
              ? "bg-[#f0fdf4] border border-[#bbf7d0] text-[#15803d]"
              : "bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c]"
          }`}
        >
          {notice.kind === "ok" ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center">
          <RefreshCw className="w-4 h-4 animate-spin text-[#999] mx-auto" />
        </div>
      ) : !configured ? (
        <p className="text-xs text-[#999]">Microsoft isn&apos;t set up on this environment.</p>
      ) : connected ? (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#17c964]" />
            <p className="text-sm text-[#0a0a0a]">{connection?.displayName || connection?.microsoftUpn}</p>
          </div>
          {connection?.microsoftUpn && connection.displayName && (
            <p className="text-[11px] text-[#999] mb-3 -mt-2">{connection.microsoftUpn}</p>
          )}
          <button
            onClick={handleDisconnect}
            disabled={working}
            className="flex items-center gap-2 border border-[#eaeaea] bg-white text-xs font-medium text-[#444] px-3 py-1.5 rounded-lg hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            <Unlink className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </>
      ) : (
        <>
          {connection?.brokenReason && (
            <p className="text-[11px] text-[#b91c1c] mb-3">
              The connection stopped working and needs setting up again.
            </p>
          )}
          <a
            href="/api/microsoft/connect"
            className="inline-flex items-center gap-2 bg-[#0a0a0a] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#333] transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" />
            {connection ? "Reconnect" : "Connect Microsoft"}
          </a>
        </>
      )}
    </div>
  );
}
