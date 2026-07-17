"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  STATUS_META,
  DISPLAY_ORDER,
  TYPE_META,
  normalizeType,
  type DisplayState,
} from "@/lib/status";
import { kioskAct, kioskIdentify, setKioskLockedWithPin } from "@/app/actions";

export type KioskKnife = {
  id: number;
  number: string;
  status: string;
  type: string;
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
    case "CLEANED": // legacy state — cleaning also returns these to service
      return { action: "CLEAN", label: "Clean & return to service", role: "Sanitation" };
    default:
      return null; // OUT_OF_SERVICE is handled on the main board
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
          Tap a knife, enter your PIN, and confirm your name — the app runs the right action
          for your role (operators check out / in, sanitation cleans &amp; returns to service).
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

      {/* Grid — one numbered group per row (1–14, 51–64, 65–78) */}
      <div className="grid grid-cols-7 gap-2 md:grid-cols-[repeat(14,minmax(0,1fr))] content-start">
        {withState.map(({ k, state }) => (
          <button
            key={k.id}
            onClick={() => !locked && setSelectedId(k.id)}
            className={`relative aspect-square rounded-xl border-2 flex items-center justify-center text-sm sm:text-base md:text-lg font-bold transition ${
              STATUS_META[state].tile
            } ${locked ? "cursor-default" : ""}`}
            title={`#${k.number} — ${STATUS_META[state].label} · ${TYPE_META[normalizeType(k.type)].label}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 rounded px-1 leading-tight text-[9px] sm:text-[10px] font-bold ${TYPE_META[normalizeType(k.type)].badge}`}
            >
              {TYPE_META[normalizeType(k.type)].short}
            </span>
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
            ? "Puts the kiosk in view-only mode. Enter an admin or QA PIN to confirm."
            : "Re-enables check out / check in / clean. Enter an admin or QA PIN to confirm."}
        </p>
        <div className="h-12 mb-3 rounded-lg border border-slate-300 flex items-center justify-center tracking-[0.5em] text-2xl font-mono">
          {pin.replace(/./g, "•") || (
            <span className="text-slate-300 tracking-normal text-base">admin / QA PIN</span>
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
  // Two-step flow: enter PIN → verify it's really you (name check) → the
  // role-appropriate action runs.
  const [step, setStep] = useState<"pin" | "confirm">("pin");
  const [pin, setPin] = useState("");
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = kioskActionFor(knife.status);

  // Step 1: verify the PIN and find out who it belongs to.
  function identify() {
    if (!act) return;
    setError(null);
    start(async () => {
      const res = await kioskIdentify(knife.id, act.action, pin);
      if (res.ok) {
        setWorkerName(res.name);
        setStep("confirm");
      } else {
        setError(res.error);
        setPin("");
      }
    });
  }

  // Step 2: the worker confirmed it's them — run the action.
  function execute() {
    if (!act) return;
    setError(null);
    start(async () => {
      const res = await kioskAct(knife.id, act.action, pin, note);
      if (res.ok) onDone();
      else {
        // e.g. state changed since identify, or lock flipped on
        setError(res.error ?? "Action failed.");
        setStep("pin");
        setPin("");
      }
    });
  }

  function notMe() {
    setStep("pin");
    setPin("");
    setWorkerName(null);
    setError(null);
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
            No kiosk action for this knife — it&apos;s out of service.
          </p>
        ) : step === "pin" ? (
          <>
            <div className="rounded-lg bg-slate-100 px-4 py-3 mb-4 text-center">
              <div className="text-lg font-semibold">{act.label}</div>
              <div className="text-xs text-slate-500">Enter your {act.role} PIN</div>
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
                onClick={identify}
                disabled={pending || pin.length === 0}
                className="h-14 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
              >
                {pending ? "…" : "Next"}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: confirm identity, then act */}
            <div className="rounded-lg bg-slate-100 px-4 py-4 mb-4 text-center">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                Verify it&apos;s you
              </div>
              <div className="text-2xl font-bold">{workerName}</div>
              <div className="text-sm text-slate-600 mt-2">
                {act.label} — knife #{knife.number}
              </div>
            </div>

            <label className="block text-sm text-slate-600 mb-1">
              {act.action === "CLEAN"
                ? "Note (optional — e.g. residue found, extra sanitizing)"
                : "Note (optional)"}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Add a note if needed…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 mb-4 text-sm"
            />

            {error && (
              <p className="text-center text-sm text-red-600 mb-3" role="alert">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={notMe}
                disabled={pending}
                className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold disabled:opacity-50"
              >
                Not me
              </button>
              <button
                onClick={execute}
                disabled={pending}
                className="h-14 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
              >
                {pending ? "…" : `Yes, that's me — ${act.action === "CLEAN" ? "clean" : act.action === "CHECKOUT" ? "check out" : "check in"}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
