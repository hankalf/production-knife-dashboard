"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addKnife,
  addWorker,
  setWorkerActive,
  updateWorker,
  deleteWorker,
  updateCheckoutWindow,
  updateEmailSettings,
  setKioskLocked,
  type ActionResult,
} from "@/app/actions";
import type { EmailSettings } from "@/lib/data";

const ALL_ROLES = ["OPERATOR", "SANITATION", "QA", "ADMIN"];

type WorkerRow = { id: number; name: string; roles: string; active: boolean };

export function AdminPanel({
  checkoutWindowHours,
  kioskLocked,
  emailSettings,
  workers,
}: {
  checkoutWindowHours: number;
  kioskLocked: boolean;
  emailSettings: EmailSettings;
  workers: WorkerRow[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <AddKnifeCard />
        <CheckoutWindowCard hours={checkoutWindowHours} />
        <AddWorkerCard />
        <WorkersCard workers={workers} />
        <KioskLockCard locked={kioskLocked} />
      </div>
      <EmailAlertsCard settings={emailSettings} />
    </div>
  );
}

function KioskLockCard({ locked }: { locked: boolean }) {
  const { pending, msg, run } = useRun();
  return (
    <Card title="Kiosk mode">
      <p className="text-sm text-slate-500 mb-3">
        The wall-display kiosk lets floor staff check out, check in, and clean with their PIN.
        Lock it to make the kiosk view-only (supervisors can also lock/unlock from the kiosk
        itself with an admin PIN).
      </p>
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
            locked ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {locked ? "🔒 Locked (view-only)" : "🔓 Interactive"}
        </span>
        <button
          onClick={() =>
            run(
              () => setKioskLocked(!locked),
              `Kiosk ${locked ? "unlocked" : "locked"}.`
            )
          }
          disabled={pending}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
            locked ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
          }`}
        >
          {locked ? "Unlock kiosk" : "Lock kiosk"}
        </button>
      </div>
      <Msg msg={msg} />
    </Card>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function run(fn: () => Promise<ActionResult>, successText: string, onSuccess?: () => void) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ ok: true, text: successText });
        onSuccess?.();
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
  const [type, setType] = useState<"FC" | "NFC">("FC");
  return (
    <Card title="Add a knife">
      <p className="text-sm text-slate-500 mb-3">
        New knives enter the fleet as Available.
      </p>
      <div className="flex gap-2 mb-2">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          inputMode="numeric"
          placeholder="Knife number (e.g. 79)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
        />
        <button
          onClick={() => run(() => addKnife(number, type), `Knife #${number} added.`)}
          disabled={pending}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <div className="flex gap-2">
        {(["FC", "NFC"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium border ${
              type === t
                ? t === "FC"
                  ? "bg-blue-600 text-white border-transparent"
                  : "bg-slate-300 text-slate-800 border-transparent"
                : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t === "FC" ? "Food Contact" : "Non-Food Contact"}
          </button>
        ))}
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

function EmailAlertsCard({ settings }: { settings: EmailSettings }) {
  const { pending, msg, run } = useRun();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [recipients, setRecipients] = useState(settings.recipients);
  const [notifyOverdue, setNotifyOverdue] = useState(settings.notifyOverdue);
  const [notifyDailySweep, setNotifyDailySweep] = useState(settings.notifyDailySweep);

  return (
    <Card title="Email alerts">
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <span className="font-medium">Not connected yet.</span> These preferences are
        saved, but no emails are sent until email delivery is wired up. This screen sets up
        who would be notified and about what.
      </div>

      <label className="flex items-center gap-3 mb-4">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-5 h-5"
        />
        <span className="font-medium">Enable email alerts (once delivery is connected)</span>
      </label>

      <label className="block text-sm text-slate-600 mb-1">
        Recipients (comma or newline separated)
      </label>
      <textarea
        value={recipients}
        onChange={(e) => setRecipients(e.target.value)}
        placeholder="qa-lead@plant.com, floor-supervisor@plant.com"
        rows={2}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 mb-4"
      />

      <fieldset className="mb-4">
        <legend className="text-sm text-slate-600 mb-2">Notify when…</legend>
        <label className="flex items-center gap-3 mb-2">
          <input
            type="checkbox"
            checked={notifyOverdue}
            onChange={(e) => setNotifyOverdue(e.target.checked)}
            className="w-5 h-5"
          />
          <span>A knife goes overdue (out past its time limit)</span>
        </label>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={notifyDailySweep}
            onChange={(e) => setNotifyDailySweep(e.target.checked)}
            className="w-5 h-5"
          />
          <span>End-of-day sweep — knives still checked out at shift close</span>
        </label>
      </fieldset>

      <button
        onClick={() =>
          run(
            () =>
              updateEmailSettings({ enabled, recipients, notifyOverdue, notifyDailySweep }),
            "Email preferences saved."
          )
        }
        disabled={pending}
        className="rounded-lg bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 disabled:opacity-50"
      >
        Save preferences
      </button>
      <Msg msg={msg} />
    </Card>
  );
}

function WorkersCard({ workers }: { workers: WorkerRow[] }) {
  return (
    <Card title="Employees">
      <p className="text-sm text-slate-500 mb-3">
        Edit an employee&apos;s name, roles, or PIN; deactivate to revoke access while keeping
        their history; remove to delete entirely.
      </p>
      <ul className="divide-y divide-slate-100">
        {workers.map((w) => (
          <EmployeeRow key={w.id} worker={w} />
        ))}
      </ul>
    </Card>
  );
}

function EmployeeRow({ worker }: { worker: WorkerRow }) {
  const { pending, msg, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [name, setName] = useState(worker.name);
  const [roles, setRoles] = useState<string[]>(
    worker.roles.split(",").map((r) => r.trim()).filter(Boolean)
  );
  const [pin, setPin] = useState("");

  function toggle(r: string) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  function reset() {
    setName(worker.name);
    setRoles(worker.roles.split(",").map((r) => r.trim()).filter(Boolean));
    setPin("");
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="py-3 space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Name"
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
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          inputMode="numeric"
          placeholder="New PIN (leave blank to keep current)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <div className="flex gap-2">
          <button
            onClick={() =>
              run(
                () => updateWorker(worker.id, { name, roles, pin: pin || undefined }),
                `${name} updated.`,
                () => setEditing(false)
              )
            }
            disabled={pending}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={reset}
            className="rounded-lg bg-slate-100 hover:bg-slate-200 px-4 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
        <Msg msg={msg} />
      </li>
    );
  }

  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className={`font-medium ${worker.active ? "" : "text-slate-400 line-through"}`}>
            {worker.name}
          </div>
          <div className="text-xs text-slate-500">{worker.roles}</div>
        </div>
        <div className="flex flex-wrap gap-1 justify-end">
          <button
            onClick={() => setEditing(true)}
            className="text-sm rounded-lg px-3 py-1.5 bg-slate-100 hover:bg-slate-200"
          >
            Edit
          </button>
          <button
            onClick={() =>
              run(
                () => setWorkerActive(worker.id, !worker.active),
                `${worker.name} ${worker.active ? "deactivated" : "reactivated"}.`
              )
            }
            disabled={pending}
            className={`text-sm rounded-lg px-3 py-1.5 disabled:opacity-50 ${
              worker.active
                ? "bg-slate-100 hover:bg-slate-200"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {worker.active ? "Deactivate" : "Reactivate"}
          </button>
          {confirmRemove ? (
            <>
              <button
                onClick={() =>
                  run(() => deleteWorker(worker.id), `${worker.name} removed.`, () =>
                    setConfirmRemove(false)
                  )
                }
                disabled={pending}
                className="text-sm rounded-lg px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="text-sm rounded-lg px-3 py-1.5 bg-slate-100 hover:bg-slate-200"
              >
                No
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="text-sm rounded-lg px-3 py-1.5 bg-slate-100 hover:bg-red-100 hover:text-red-700"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <Msg msg={msg} />
    </li>
  );
}
