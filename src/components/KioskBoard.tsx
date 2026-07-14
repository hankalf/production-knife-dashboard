"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STATUS_META, DISPLAY_ORDER, type DisplayState } from "@/lib/status";

export type KioskKnife = {
  id: number;
  number: string;
  status: string;
  dueAtMs: number | null;
};

function stateOf(k: KioskKnife, now: number): DisplayState {
  if (k.status === "CHECKED_OUT" && k.dueAtMs && k.dueAtMs < now) return "OVERDUE";
  return k.status as DisplayState;
}

export default function KioskBoard({ knives }: { knives: KioskKnife[] }) {
  const router = useRouter();
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => router.refresh(), 5000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  const withState = useMemo(
    () => knives.map((k) => ({ k, state: stateOf(k, now || Date.now()) })),
    [knives, now]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { state } of withState) c[state] = (c[state] ?? 0) + 1;
    return c;
  }, [withState]);

  const overdue = withState.filter((x) => x.state === "OVERDUE").map((x) => x.k.number);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col p-6 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <span aria-hidden>🔪</span> Safety Knife Status Board
        </h1>
        <Link href="/" className="text-slate-400 text-sm hover:text-white">
          Exit kiosk ✕
        </Link>
      </div>

      {/* Big status counts */}
      <div className="flex flex-wrap gap-3 mb-5">
        {DISPLAY_ORDER.map((s) => (
          <div
            key={s}
            className="flex items-center gap-3 rounded-xl bg-slate-900 border border-slate-800 px-4 py-3"
          >
            <span className={`inline-block w-4 h-4 rounded-full ${STATUS_META[s].dot}`} />
            <span className="text-slate-300">{STATUS_META[s].label}</span>
            <span className="text-2xl font-bold tabular-nums">{counts[s] ?? 0}</span>
          </div>
        ))}
      </div>

      {overdue.length > 0 && (
        <div className="mb-5 rounded-xl bg-red-950 border border-red-700 px-5 py-4 text-red-200 text-xl font-semibold flex items-center gap-3">
          <span aria-hidden className="text-2xl">⚠️</span>
          {overdue.length} OVERDUE — return &amp; clean now: {overdue.map((n) => `#${n}`).join("  ")}
        </div>
      )}

      {/* Large grid */}
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-3 flex-1 content-start">
        {withState.map(({ k, state }) => (
          <div
            key={k.id}
            className={`aspect-square rounded-2xl border-2 flex items-center justify-center text-2xl font-bold ${STATUS_META[state].tile}`}
            title={`#${k.number} — ${STATUS_META[state].label}`}
          >
            #{k.number}
          </div>
        ))}
      </div>
    </div>
  );
}
