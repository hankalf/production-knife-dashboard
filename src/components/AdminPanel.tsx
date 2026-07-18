"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addKnife,
  addWorker,
  setWorkerActive,
  updateWorker,
  deleteWorker,
  updateTeamsSettings,
  sendTeamsTest,
  bulkAddWorkers,
  setKioskLocked,
  type ActionResult,
} from "@/app/actions";
import type { TeamsSettings } from "@/lib/data";

const ALL_ROLES = ["OPERATOR", "SANITATION", "QA", "ADMIN"];
const INPUT =
  "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2";

type WorkerRow = { id: number; name: string; roles: string; active: boolean };

export function AdminPanel({
  kioskLocked,
  teamsSettings,
  workers,
}: {
  kioskLocked: boolean;
  teamsSettings: TeamsSettings;
  workers: WorkerRow[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <AddKnifeCard />
        <KioskLockCard locked={kioskLocked} />
        <AddWorkerCard />
        <WorkersCard workers={workers} />
      </div>
      <TeamsCard settings={teamsSettings} />
    </div>
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
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`text-sm mt-2 ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
  );
}

function AddKnifeCard() {
  const { pending, msg, run } = useRun();
  const [number, setNumber] = useState("");
  const [type, setType] = useState<"FC" | "NFC">("FC");
  return (
    <Card title="Add a knife">
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        New knives enter the fleet as Available.
      </p>
      <div className="flex gap-2 mb-2">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          inputMode="numeric"
          placeholder="Knife number (e.g. 79)"
          className={`flex-1 ${INPUT}`}
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
                : "bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
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

function KioskLockCard({ locked }: { locked: boolean }) {
  const { pending, msg, run } = useRun();
  return (
    <Card title="Kiosk mode">
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        The wall-display kiosk lets floor staff check out, check in, and clean with their PIN.
        Lock it to make the kiosk view-only.
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
            run(() => setKioskLocked(!locked), `Kiosk ${locked ? "unlocked" : "locked"}.`)
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

const SAMPLE_CSV =
  "name,pin,roles\n" +
  "Jane Operator,4501,OPERATOR\n" +
  "Sam Sanitation,4502,SANITATION\n" +
  "Pat Supervisor,4503,OPERATOR;SANITATION\n" +
  "Quinn QA,4504,QA\n" +
  "Alex Manager,4505,ADMIN\n";

function AddWorkerCard() {
  const { pending, msg, run } = useRun();
  const router = useRouter();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [roles, setRoles] = useState<string[]>(["OPERATOR"]);
  const [bulkPending, startBulk] = useTransition();
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function toggle(r: string) {
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      startBulk(async () => {
        const res = await bulkAddWorkers(text);
        const parts = [`${res.added} added`, `${res.skipped} skipped`];
        const text2 = parts.join(", ") + (res.errors.length ? ` — ${res.errors.slice(0, 4).join(" ")}` : "");
        setBulkMsg({ ok: res.added > 0, text: text2 });
        router.refresh();
      });
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workers-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card title="Add a worker">
      <div className="space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={INPUT} />
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          inputMode="numeric"
          placeholder="PIN (4–8 digits)"
          className={INPUT}
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
                  : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          onClick={() => run(() => addWorker(name, pin, roles), `${name || "Worker"} added.`)}
          disabled={pending}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white py-2 disabled:opacity-50"
        >
          Add worker
        </button>
      </div>
      <Msg msg={msg} />

      {/* Bulk upload */}
      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
        <div className="text-sm font-medium mb-1">Bulk upload (CSV)</div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          Columns: <code>name,pin,roles</code> (roles separated by <code>;</code> — e.g.
          <code> OPERATOR;SANITATION</code>). Duplicate PINs are skipped.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            disabled={bulkPending}
            className="text-sm"
          />
          <button
            type="button"
            onClick={downloadSample}
            className="text-sm rounded-lg px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200"
          >
            Download sample CSV
          </button>
        </div>
        <Msg msg={bulkMsg} />
      </div>
    </Card>
  );
}

function TeamsCard({ settings }: { settings: TeamsSettings }) {
  const { pending, msg, run } = useRun();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl);
  const [notifyDamaged, setNotifyDamaged] = useState(settings.notifyDamaged);
  const [notifyOverdue, setNotifyOverdue] = useState(settings.notifyOverdue);

  return (
    <Card title="Microsoft Teams notifications">
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        Paste an <strong>Incoming Webhook</strong> URL from your Teams channel. When a knife is
        flagged <strong>damaged</strong>, a message is posted to that channel so a manager can
        review it. (Overdue/scheduled alerts need a scheduled job — the damaged alert works now.)
      </p>

      <label className="flex items-center gap-3 mb-3">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-5 h-5" />
        <span className="font-medium">Enable Teams notifications</span>
      </label>

      <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">Webhook URL</label>
      <input
        value={webhookUrl}
        onChange={(e) => setWebhookUrl(e.target.value)}
        placeholder="https://<tenant>.webhook.office.com/webhookb2/…"
        className={`${INPUT} mb-3`}
      />

      <fieldset className="mb-4">
        <legend className="text-sm text-slate-600 dark:text-slate-300 mb-2">Notify when…</legend>
        <label className="flex items-center gap-3 mb-2">
          <input type="checkbox" checked={notifyDamaged} onChange={(e) => setNotifyDamaged(e.target.checked)} className="w-5 h-5" />
          <span>A knife is flagged damaged (needs a manager) — live</span>
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={notifyOverdue} onChange={(e) => setNotifyOverdue(e.target.checked)} className="w-5 h-5" />
          <span>A knife goes overdue (requires a scheduled job)</span>
        </label>
      </fieldset>

      <div className="flex gap-2">
        <button
          onClick={() =>
            run(
              () => updateTeamsSettings({ enabled, webhookUrl, notifyDamaged, notifyOverdue }),
              "Teams settings saved."
            )
          }
          disabled={pending}
          className="rounded-lg bg-slate-800 dark:bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => run(() => sendTeamsTest(), "Test message sent to Teams.")}
          disabled={pending}
          className="rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 disabled:opacity-50"
        >
          Send test message
        </button>
      </div>
      <Msg msg={msg} />
    </Card>
  );
}

function WorkersCard({ workers }: { workers: WorkerRow[] }) {
  return (
    <Card title="Employees">
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        Edit an employee&apos;s name, roles, or PIN; deactivate to revoke access while keeping
        their history; remove to delete entirely.
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
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
        <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="Name" />
        <div className="flex flex-wrap gap-2">
          {ALL_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggle(r)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                roles.includes(r)
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
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
          className={INPUT}
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
          <button onClick={reset} className="rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 px-4 py-2 text-sm">
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
          <div className="text-xs text-slate-500 dark:text-slate-400">{worker.roles}</div>
        </div>
        <div className="flex flex-wrap gap-1 justify-end">
          <button
            onClick={() => setEditing(true)}
            className="text-sm rounded-lg px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200"
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
                ? "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {worker.active ? "Deactivate" : "Reactivate"}
          </button>
          {confirmRemove ? (
            <>
              <button
                onClick={() =>
                  run(() => deleteWorker(worker.id), `${worker.name} removed.`, () => setConfirmRemove(false))
                }
                disabled={pending}
                className="text-sm rounded-lg px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="text-sm rounded-lg px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200"
              >
                No
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="text-sm rounded-lg px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-red-100 hover:text-red-700"
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
