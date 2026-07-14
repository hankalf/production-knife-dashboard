"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STATUS_META, DISPLAY_ORDER, type DisplayState } from "@/lib/status";
import { kioskAct, setKioskLockedWithPin } from "@/app/actions";

export type KioskKnife = {
  id: number;
  number: string;
  status: string;
  dueAtMs: number | null;
};

type KioskAction = "CHECKOUT" | "RETURN" | "CLEAN";

function stateOf(k: KioskKnife, now: number): DisplayState {
  if (k.status === "CHECKED_OUT" && k.dueAtMs && k.dueAtMs < now) return "OVERDUE";
  return k.status as DisplayState;
}

// What a floor worker can do to this knife straight from the kiosk.
function kioskActionFor(status: string): { action: KioskAction; label: string; role: string } | null {
  switch (status) {
    case "AVAILABLE":
      return { action: "CHECKOUT", label: "Check out", role: "Operator" };
    case "CHECKED_OUT":
      return { action: "RETURN", label: "Check in (return)", role: "Operator" };
    case "DIRTY":
      return { action: "CLEAN", label: "Mark cleaned", role: "Sanitation" };
    default:
      return null; // CLEANED (QA) and OUT_OF_SERVICE are handled on the main board
  }
}

export default function KioskBoard({
  knives,
  locked,
}: {
  knives: KioskKnife[];
  locked: boolean;
}) {
  const router = useRouter();
  const [now, setNow] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);

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
  const selected = knives.find((k) => k.id === selectedId) ?? null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col p-6 overflow-auto">
      <div className="flex items-center justify-between mb-1 gap-3">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <span aria-hidden>🔪</span> Safety Knife Status Board
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLockDialogOpen(true)}
            className={`text-sm rounded-lg px-3 py-1.5 border ${
              locked
                ? "bg-amber-500/20 border-amber-500 text-amber-200 hover:bg-amber-500/30"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {locked ? "🔒 Locked — Unlock" : "🔓 Lock kiosk"}
          </button>
          <Link href="/" className="text-slate-400 text-sm hover:text-white">
            Exit kiosk ✕
          </Link>
        </div>
      </div>
      {locked ? (
        <p className="text-amber-300 text-sm mb-4 flex items-center gap-2">
          <span aria-hidden>🔒</span> View-only — a supervisor has locked the kiosk. Actions are
          disabled until it&apos;s unlocked.
        </p>
      ) : (
        <p className="text-slate-400 text-sm mb-4">
          Tap a knife to check out, check in, or mark cleaned — you&apos;ll confirm with your PIN.
          QA and admin actions use the main board.
        </p>
      )}

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
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-3 content-start">
        {withState.map(({ k, state }) => (
          <button
            key={k.id}
            onClick={() => !locked && setSelectedId(k.id)}
            className={`aspect-square rounded-2xl border-2 flex items-center justify-center text-2xl font-bold transition ${
              STATUS_META[state].tile
            } ${locked ? "cursor-default" : ""}`}
            title={`#${k.number} — ${STATUS_META[state].label}`}
          >
            #{k.number}
          </button>
        ))}
      </div>

      {selected && !locked && (
        <KioskModal
          knife={selected}
          state={stateOf(selected, now || Date.now())}
          onClose={() => setSelectedId(null)}
          onDone={() => {
            setSelectedId(null);
            router.refresh();
          }}
        />
      )}

      {lockDialogOpen && (
        <LockDialog
          locked={locked}
          onClose={() => setLockDialogOpen(false)}
          onDone={() => {
            setLockDialogOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function LockDialog({
  locked,
  onClose,
  onDone,
}: {
  locked: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nextLocked = !locked;

  function submit() {
    setError(null);
    start(async () => {
      const res = await setKioskLockedWithPin(nextLocked, pin);
      if (res.ok) onDone();
      else {
        setError(res.error ?? "Failed.");
        setPin("");
      }
    });
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white text-slate-900 w-full max-w-sm rounded-2xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">
            {nextLocked ? "Lock kiosk" : "Unlock kiosk"}
          </h2>
          <button onClick={onClose} className="text-slate-400 text-3xl leading-none px-2">
            ×
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          {nextLocked
            ? "Puts the kiosk in view-only mode. Enter an admin PIN to confirm."
            : "Re-enables check out / check in / clean. Enter an admin PIN to confirm."}
        </p>
        <div className="h-12 mb-3 rounded-lg border border-slate-300 flex items-center justify-center tracking-[0.5em] text-2xl font-mono">
          {pin.replace(/./g, "•") || (
            <span className="text-slate-300 tracking-normal text-base">admin PIN</span>
          )}
        </div>
        {error && (
          <p className="text-center text-sm text-red-600 mb-3" role="alert">
            {error}
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {keys.map((d) => (
            <button
              key={d}
              onClick={() => {
                setError(null);
                setPin((p) => (p.length >= 8 ? p : p + d));
              }}
              className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-xl font-semibold"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-lg"
            aria-label="Delete"
          >
            ⌫
          </button>
          <button
            onClick={() => {
              setError(null);
              setPin((p) => (p.length >= 8 ? p : p + "0"));
            }}
            className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-xl font-semibold"
          >
            0
          </button>
          <button
            onClick={submit}
            disabled={pending || pin.length === 0}
            className={`h-14 rounded-lg text-white font-semibold disabled:opacity-50 ${
              nextLocked ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {pending ? "…" : nextLocked ? "Lock" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}

function KioskModal({
  knife,
  state,
  onClose,
  onDone,
}: {
  knife: KioskKnife;
  state: DisplayState;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = kioskActionFor(knife.status);

  function submit() {
    if (!act) return;
    setError(null);
    start(async () => {
      const res = await kioskAct(knife.id, act.action, pin);
      if (res.ok) onDone();
      else {
        setError(res.error ?? "Action failed.");
        setPin("");
      }
    });
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white text-slate-900 w-full max-w-sm rounded-2xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold">Knife #{knife.number}</h2>
          <button onClick={onClose} className="text-slate-400 text-3xl leading-none px-2">
            ×
          </button>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className={`inline-block w-3 h-3 rounded-full ${STATUS_META[state].dot}`} />
          <span className="font-medium">{STATUS_META[state].label}</span>
        </div>

        {!act ? (
          <p className="text-slate-600">
            No kiosk action for this knife.{" "}
            {knife.status === "CLEANED"
              ? "It's awaiting QA — handle it on the main board."
              : "It's out of service."}
          </p>
        ) : (
          <>
            <div className="rounded-lg bg-slate-100 px-4 py-3 mb-4 text-center">
              <div className="text-lg font-semibold">{act.label}</div>
              <div className="text-xs text-slate-500">Enter your {act.role} PIN to confirm</div>
            </div>

            <div className="h-12 mb-3 rounded-lg border border-slate-300 flex items-center justify-center tracking-[0.5em] text-2xl font-mono">
              {pin.replace(/./g, "•") || (
                <span className="text-slate-300 tracking-normal text-base">enter PIN</span>
              )}
            </div>
            {error && (
              <p className="text-center text-sm text-red-600 mb-3" role="alert">
                {error}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {keys.map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setError(null);
                    setPin((p) => (p.length >= 8 ? p : p + d));
                  }}
                  className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-xl font-semibold"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => setPin((p) => p.slice(0, -1))}
                className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-lg"
                aria-label="Delete"
              >
                ⌫
              </button>
              <button
                onClick={() => {
                  setError(null);
                  setPin((p) => (p.length >= 8 ? p : p + "0"));
                }}
                className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-xl font-semibold"
              >
                0
              </button>
              <button
                onClick={submit}
                disabled={pending || pin.length === 0}
                className="h-14 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
              >
                {pending ? "…" : "Confirm"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
