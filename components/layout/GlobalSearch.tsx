"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Search, LayoutGrid, Building2, CheckSquare, FolderKanban } from "lucide-react";
import { NAV_PAGES } from "@/lib/nav-pages";

// The shortcut badge has to match the platform: the handler below takes either
// modifier, but "⌘" on Windows is both the wrong key and a glyph Geist doesn't
// carry, so it falls back to a symbol font and renders cramped and misaligned.
//
// useSyncExternalStore rather than an effect: it gives a server snapshot
// (non-Mac) distinct from the client one without a hydration warning, and
// without a setState-in-effect.
const subscribeNoop = () => () => {};
const isMacClient = () =>
  /mac|iphone|ipad|ipod/i.test(
    // `||` not `??`: some privacy modes report an empty platform string, which
    // should fall through to the next source rather than count as an answer.
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      "",
  );

function useIsMac(): boolean {
  return useSyncExternalStore(subscribeNoop, isMacClient, () => false);
}

interface PortalCustomer {
  id: string;
  company: string;
  contact: string;
  email: string;
}

interface TaskCard {
  id: string;
  type: "task" | "meeting" | "project";
  title: string;
}

interface ProjectRow {
  id: string;
  name: string;
  clientName?: string;
}

interface ResultItem {
  key: string;
  group: "Pages" | "Customers" | "Tasks & Meetings" | "Projects";
  icon: typeof Search;
  label: string;
  sublabel?: string;
  href: string;
}

function readCache<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export default function GlobalSearch({ allowedHrefs }: { allowedHrefs?: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Cmd/Ctrl+K focuses the search box, matching the shortcut users expect from
  // similar command-style search bars elsewhere.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const pages: ResultItem[] = NAV_PAGES
      .filter((p) => !allowedHrefs || allowedHrefs.includes(p.href))
      .filter((p) => p.label.toLowerCase().includes(q))
      .slice(0, 4)
      .map((p) => ({ key: `page:${p.href}`, group: "Pages", icon: LayoutGrid, label: p.label, sublabel: p.section, href: p.href }));

    const customers: ResultItem[] = readCache<PortalCustomer>("sc:customers")
      .filter((c) => c.company?.toLowerCase().includes(q) || c.contact?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((c) => ({ key: `customer:${c.id}`, group: "Customers", icon: Building2, label: c.company || c.id, sublabel: c.contact, href: `/customers/${c.id}` }));

    const tasks: ResultItem[] = readCache<TaskCard>("sc:tasks")
      .filter((t) => t.type !== "project" && t.title?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((t) => ({
        key: `task:${t.id}`,
        group: "Tasks & Meetings",
        icon: CheckSquare,
        label: t.title,
        sublabel: t.type === "meeting" ? "Meeting" : "Task",
        href: `/tasks?task=${t.id}`,
      }));

    const projects: ResultItem[] = readCache<ProjectRow>("sc:projects")
      .filter((p) => p.name?.toLowerCase().includes(q) || p.clientName?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((p) => ({ key: `project:${p.id}`, group: "Projects", icon: FolderKanban, label: p.name, sublabel: p.clientName, href: `/projects/${p.id}` }));

    return [...pages, ...customers, ...tasks, ...projects];
  }, [query, allowedHrefs]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function go(item: ResultItem) {
    router.push(item.href);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const isMac = useIsMac();

  let lastGroup: string | null = null;

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#999]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search pages, customers, tasks, projects…"
          className={`w-full h-9 pl-9 rounded-lg border border-[#eaeaea] bg-[#fafafa] text-sm text-[#0a0a0a] placeholder:text-[#999] focus:outline-none focus:ring-2 focus:ring-[#0070f3]/30 focus:border-[#0070f3] focus:bg-white transition-colors ${isMac ? "pr-14" : "pr-20"}`}
        />
        {/* pointer-events-none so a click on the badge still lands on the input */}
        <kbd
          aria-hidden
          className="hidden lg:flex items-center justify-center gap-1 whitespace-nowrap absolute right-2 top-1/2 -translate-y-1/2 h-5 px-1.5 rounded-md border border-[#eaeaea] bg-white text-[#999] font-sans leading-none select-none pointer-events-none"
        >
          <span className={isMac ? "text-[13px]" : "text-[10px] font-medium"}>
            {isMac ? "⌘" : "Ctrl"}
          </span>
          <span className="text-[10px] font-medium">K</span>
        </kbd>
      </div>

      {open && query.trim() && (
        <div className="absolute left-0 right-0 mt-2 bg-white border border-[#eaeaea] rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-sm text-[#999] text-center py-8">No results for &ldquo;{query}&rdquo;</p>
          ) : (
            <div className="py-1.5">
              {results.map((item, i) => {
                const showHeader = item.group !== lastGroup;
                lastGroup = item.group;
                const Icon = item.icon;
                return (
                  <div key={item.key}>
                    {showHeader && (
                      <p className="px-4 pt-2.5 pb-1 text-[10px] font-semibold text-[#999] uppercase tracking-widest">
                        {item.group}
                      </p>
                    )}
                    <button
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => go(item)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                        i === activeIndex ? "bg-[#fafafa]" : "hover:bg-[#fafafa]"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 text-[#999] shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-[#0a0a0a] truncate">{item.label}</span>
                        {item.sublabel && (
                          <span className="block text-xs text-[#999] truncate">{item.sublabel}</span>
                        )}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
