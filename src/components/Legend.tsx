import { STATUS_META, DISPLAY_ORDER } from "@/lib/status";

export function Legend() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-2">Legend</h2>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
        {DISPLAY_ORDER.map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${STATUS_META[s].dot}`} />
            <span>{STATUS_META[s].label}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Lifecycle: Available → Checked out → Awaiting sanitation → Awaiting QA → Available.
        A knife can only be checked out after passing QA.
      </p>
    </div>
  );
}
