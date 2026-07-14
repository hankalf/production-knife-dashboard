import Link from "next/link";
import { getCurrentWorker } from "@/lib/session";
import { hasRole } from "@/lib/status";
import { getWorkers, getCheckoutWindowHours, getRecentEvents } from "@/lib/data";
import { ACTION_LABEL } from "@/lib/status";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const worker = await getCurrentWorker();
  if (!worker || !hasRole(worker.roles, "ADMIN")) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <h1 className="text-xl font-bold mb-2">Admin only</h1>
        <p className="text-slate-500 mb-4">
          You must be signed in with an ADMIN PIN to manage knives and workers.
        </p>
        <Link href="/" className="text-sky-700 underline">
          ← Back to fleet
        </Link>
      </div>
    );
  }

  const [workers, hours, events] = await Promise.all([
    getWorkers(),
    getCheckoutWindowHours(),
    getRecentEvents(50),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <Link href="/" className="text-sm text-sky-700 underline">
          ← Back to fleet
        </Link>
      </div>

      <AdminPanel
        checkoutWindowHours={hours}
        workers={workers.map((w) => ({
          id: w.id,
          name: w.name,
          roles: w.roles,
          active: w.active,
        }))}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent activity (audit log)</h2>
          <a
            href="/api/export"
            className="rounded-lg bg-slate-800 text-white text-sm px-3 py-2 hover:bg-slate-700"
          >
            Export full log (CSV)
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr>
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Knife</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">By</th>
                <th className="py-2 pr-4">Note</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
                    {e.createdAt.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 font-medium">#{e.knife.number}</td>
                  <td className="py-2 pr-4">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="py-2 pr-4">{e.worker?.name ?? "—"}</td>
                  <td className="py-2 pr-4 text-slate-500">{e.note ?? ""}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
