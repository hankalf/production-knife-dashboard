import { STATUS_META, DISPLAY_ORDER, TYPE_META, KNIFE_TYPE } from "@/lib/status";

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
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
        <span className="text-xs font-semibold text-slate-500 self-center">Type (corner badge):</span>
        {Object.values(KNIFE_TYPE).map((t) => (
          <div key={t} className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_META[t].badge}`}>
              {TYPE_META[t].short}
            </span>
            <span>{TYPE_META[t].label}</span>
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
