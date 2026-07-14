"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addKnife,
  addWorker,
  setWorkerActive,
  updateCheckoutWindow,
  type ActionResult,
} from "@/app/actions";

const ALL_ROLES = ["OPERATOR", "SANITATION", "QA", "ADMIN"];

type WorkerRow = { id: number; name: string; roles: string; active: boolean };

export function AdminPanel({
  checkoutWindowHours,
  workers,
}: {
  checkoutWindowHours: number;
  workers: WorkerRow[];
}) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <AddKnifeCard />
      <CheckoutWindowCard hours={checkoutWindowHours} />
      <AddWorkerCard />
      <WorkersCard workers={workers} />
    </div>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function run(fn: () => Promise<ActionResult>, successText: string) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ ok: true, text: successText });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error ?? "Failed." });
      }
    });
  }
  return { pending, msg, run };
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`text-sm mt-2 ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>
      {msg.text}
    </p>
  );
}

function AddKnifeCard() {
  const { pending, msg, run } = useRun();
  const [number, setNumber] = useState("");
  return (
    <Card title="Add a knife">
      <p className="text-sm text-slate-500 mb-3">
        New knives enter the fleet as Available.
      </p>
      <div className="flex gap-2">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          inputMode="numeric"
          placeholder="Knife number (e.g. 79)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
        />
        <button
          onClick={() => run(() => addKnife(number), `Knife #${number} added.`)}
          disabled={pending}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <Msg msg={msg} />
    </Card>
  );
}

function CheckoutWindowCard({ hours }: { hours: number }) {
  const { pending, msg, run } = useRun();
  const [value, setValue] = useState(String(hours));
  return (
    <Card title="Checkout time limit">
      <p className="text-sm text-slate-500 mb-3">
        A checked-out knife is flagged overdue after this many hours (default 24 = one day).
      </p>
      <div className="flex gap-2 items-center">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          className="w-24 rounded-lg border border-slate-300 px-3 py-2"
        />
        <span className="text-slate-500">hours</span>
        <button
          onClick={() => run(() => updateCheckoutWindow(Number(value)), "Time limit updated.")}
          disabled={pending}
          className="rounded-lg bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 disabled:opacity-50"
        >
          Save
        </button>
      </div>
      <Msg msg={msg} />
    </Card>
  );
}

function AddWorkerCard() {
  const { pending, msg, run } = useRun();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [roles, setRoles] = useState<string[]>(["OPERATOR"]);

  function toggle(r: string) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  return (
    <Card title="Add a worker">
      <div className="space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          inputMode="numeric"
          placeholder="PIN (4–8 digits)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <div className="flex flex-wrap gap-2">
          {ALL_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggle(r)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                roles.includes(r)
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-300 bg-white"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          onClick={() =>
            run(() => addWorker(name, pin, roles), `${name || "Worker"} added.`)
          }
          disabled={pending}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white py-2 disabled:opacity-50"
        >
          Add worker
        </button>
      </div>
      <Msg msg={msg} />
    </Card>
  );
}

function WorkersCard({ workers }: { workers: WorkerRow[] }) {
  const { pending, msg, run } = useRun();
  return (
    <Card title="Workers">
      <ul className="divide-y divide-slate-100">
        {workers.map((w) => (
          <li key={w.id} className="py-2 flex items-center justify-between gap-2">
            <div>
              <div className={`font-medium ${w.active ? "" : "text-slate-400 line-through"}`}>
                {w.name}
              </div>
              <div className="text-xs text-slate-500">{w.roles}</div>
            </div>
            <button
              onClick={() =>
                run(
                  () => setWorkerActive(w.id, !w.active),
                  `${w.name} ${w.active ? "deactivated" : "reactivated"}.`
                )
              }
              disabled={pending}
              className={`text-sm rounded-lg px-3 py-1.5 disabled:opacity-50 ${
                w.active
                  ? "bg-slate-100 hover:bg-slate-200"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {w.active ? "Deactivate" : "Reactivate"}
            </button>
          </li>
        ))}
      </ul>
      <Msg msg={msg} />
    </Card>
  );
}
