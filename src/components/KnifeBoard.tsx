"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  STATUS_META,
  DISPLAY_ORDER,
  type DisplayState,
} from "@/lib/status";
import {
  checkoutKnife,
  returnKnife,
  cleanKnife,
  qaPassKnife,
  qaFailKnife,
  retireKnife,
  restoreKnife,
  type ActionResult,
} from "@/app/actions";

export type KnifeDTO = {
  id: number;
  number: string;
  status: string;
  dueAtMs: number | null;
  checkedOutAtMs: number | null;
  holderName: string | null;
};

function computeDisplayState(k: KnifeDTO, now: number): DisplayState {
  if (k.status === "CHECKED_OUT" && k.dueAtMs && k.dueAtMs < now) return "OVERDUE";
  return k.status as DisplayState;
}

function fmt(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function KnifeBoard({
  knives,
  roles,
  signedIn,
}: {
  knives: KnifeDTO[];
  roles: string[];
  signedIn: boolean;
}) {
  const router = useRouter();
  // A ticking clock so overdue flips live without a server round-trip.
  const [now, setNow] = useState<number>(() => 0);
  const [filter, setFilter] = useState<DisplayState | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
    () => knives.map((k) => ({ k, state: computeDisplayState(k, now || Date.now()) })),
    [knives, now]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { state } of withState) c[state] = (c[state] ?? 0) + 1;
    return c;
  }, [withState]);

  const overdue = withState.filter((x) => x.state === "OVERDUE");

  const visible = withState.filter((x) => filter === "ALL" || x.state === filter);

  const selected = knives.find((k) => k.id === selectedId) ?? null;
  const selectedState = selected
    ? computeDisplayState(selected, now || Date.now())
    : null;

  return (
    <div>
      {/* Summary counts */}
      <div className="flex flex-wrap gap-2 mb-4">
        <SummaryChip
          label="All"
          count={knives.length}
          active={filter === "ALL"}
          dot="bg-slate-800"
          onClick={() => setFilter("ALL")}
        />
        {DISPLAY_ORDER.map((s) => (
          <SummaryChip
            key={s}
            label={STATUS_META[s].label}
            count={counts[s] ?? 0}
            active={filter === s}
            dot={STATUS_META[s].dot}
            onClick={() => setFilter(filter === s ? "ALL" : s)}
          />
        ))}
      </div>

      {/* Overdue banner */}
      {overdue.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800 flex items-center gap-2">
          <span aria-hidden>⚠️</span>
          <span className="font-medium">
            {overdue.length} knife{overdue.length > 1 ? "s" : ""} overdue
          </span>
          <span className="text-red-600">
            (out longer than allowed — must be returned & cleaned):{" "}
            {overdue.map((x) => `#${x.k.number}`).join(", ")}
          </span>
        </div>
      )}

      {!signedIn && (
        <p className="mb-4 text-sm text-slate-500">
          You are viewing in read-only mode. Enter your PIN below to take actions.
        </p>
      )}

      {/* Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
        {visible.map(({ k, state }) => (
          <button
            key={k.id}
            onClick={() => setSelectedId(k.id)}
            className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center font-bold text-lg transition ${STATUS_META[state].tile}`}
            title={`Knife #${k.number} — ${STATUS_META[state].label}`}
          >
            <span>#{k.number}</span>
          </button>
        ))}
        {visible.length === 0 && (
          <p className="col-span-full text-center text-slate-400 py-8">
            No knives in this state.
          </p>
        )}
      </div>

      {/* Detail / action modal */}
      {selected && selectedState && (
        <KnifeModal
          knife={selected}
          state={selectedState}
          roles={roles}
          signedIn={signedIn}
          onClose={() => setSelectedId(null)}
          onDone={() => {
            setSelectedId(null);
            router.refresh();
          }}
          fmt={fmt}
        />
      )}
    </div>
  );
}

function SummaryChip({
  label,
  count,
  active,
  dot,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dot: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
        active ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white"
      }`}
    >
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${dot}`} />
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </button>
  );
}

function KnifeModal({
  knife,
  state,
  roles,
  signedIn,
  onClose,
  onDone,
  fmt,
}: {
  knife: KnifeDTO;
  state: DisplayState;
  roles: string[];
  signedIn: boolean;
  onClose: () => void;
  onDone: () => void;
  fmt: (ms: number | null) => string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) onDone();
      else setError(res.error ?? "Action failed.");
    });
  }

  const is = knife.status;
  const has = (r: string) => roles.includes(r);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold">Knife #{knife.number}</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none px-2">
            ×
          </button>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className={`inline-block w-3 h-3 rounded-full ${STATUS_META[state].dot}`} />
          <span className="font-medium">{STATUS_META[state].label}</span>
        </div>

        <dl className="text-sm text-slate-600 space-y-1 mb-4">
          {knife.holderName && (
            <div className="flex justify-between">
              <dt>Checked out by</dt>
              <dd className="font-medium text-slate-800">{knife.holderName}</dd>
            </div>
          )}
          {knife.checkedOutAtMs && (
            <div className="flex justify-between">
              <dt>Checked out</dt>
              <dd>{fmt(knife.checkedOutAtMs)}</dd>
            </div>
          )}
          {knife.dueAtMs && (
            <div className="flex justify-between">
              <dt>Due back</dt>
              <dd className={state === "OVERDUE" ? "text-red-600 font-semibold" : ""}>
                {fmt(knife.dueAtMs)}
              </dd>
            </div>
          )}
        </dl>

        {error && (
          <p className="text-sm text-red-600 mb-3" role="alert">
            {error}
          </p>
        )}

        {!signedIn ? (
          <p className="text-sm text-slate-500">Sign in with your PIN to act on this knife.</p>
        ) : (
          <div className="space-y-2">
            {(is === "CHECKED_OUT") && state === "OVERDUE" && (
              <p className="text-xs text-red-600">This knife is overdue — return it now.</p>
            )}

            {is === "AVAILABLE" && has("OPERATOR") && (
              <ActionButton
                pending={pending}
                onClick={() => run(() => checkoutKnife(knife.id))}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Check out
              </ActionButton>
            )}

            {is === "CHECKED_OUT" && has("OPERATOR") && (
              <ActionButton
                pending={pending}
                onClick={() => run(() => returnKnife(knife.id))}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Return (mark used)
              </ActionButton>
            )}

            {is === "DIRTY" && has("SANITATION") && (
              <ActionButton
                pending={pending}
                onClick={() => run(() => cleanKnife(knife.id))}
                className="bg-violet-600 hover:bg-violet-700"
              >
                Mark cleaned
              </ActionButton>
            )}

            {is === "CLEANED" && has("QA") && (
              <>
                <ActionButton
                  pending={pending}
                  onClick={() => run(() => qaPassKnife(knife.id))}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  QA pass → back in service
                </ActionButton>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (required to fail)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <ActionButton
                  pending={pending}
                  onClick={() => run(() => qaFailKnife(knife.id, reason))}
                  className="bg-red-600 hover:bg-red-700"
                >
                  QA fail → back to sanitation
                </ActionButton>
              </>
            )}

            {has("ADMIN") && is !== "OUT_OF_SERVICE" && (
              <ActionButton
                pending={pending}
                onClick={() => run(() => retireKnife(knife.id, reason))}
                className="bg-slate-600 hover:bg-slate-700"
              >
                Retire (out of service)
              </ActionButton>
            )}
            {has("ADMIN") && is === "OUT_OF_SERVICE" && (
              <ActionButton
                pending={pending}
                onClick={() => run(() => restoreKnife(knife.id))}
                className="bg-slate-600 hover:bg-slate-700"
              >
                Restore to fleet
              </ActionButton>
            )}
          </div>
        )}

        <div className="mt-4 text-center">
          <Link
            href={`/knife/${knife.number}`}
            className="text-sm text-sky-700 underline"
          >
            View full history
          </Link>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  className,
  pending,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className: string;
  pending: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className={`w-full rounded-lg py-3 text-white font-semibold disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
