import { prisma } from "./prisma";
import { isOverdue } from "./status";

// End-of-day sweep: every knife still checked out, soonest-due first.
export async function getCheckedOutReport() {
  const knives = await prisma.knife.findMany({
    where: { status: "CHECKED_OUT" },
    include: { checkedOutBy: { select: { name: true } } },
    orderBy: { dueAt: "asc" },
  });
  return knives.map((k) => ({
    number: k.number,
    holder: k.checkedOutBy?.name ?? "—",
    checkedOutAt: k.checkedOutAt,
    dueAt: k.dueAt,
    overdue: isOverdue(k.status, k.dueAt),
  }));
}

export type FleetMetrics = {
  totalCheckouts: number;
  qaPass: number;
  qaFail: number;
  qaFailRate: number | null; // 0..1
  cyclesMeasured: number;
  avgTurnaroundMs: number | null; // return -> back in service
  mostUsed: { number: string; count: number }[];
};

// Aggregate the immutable event log into fleet-level metrics.
export async function getMetrics(): Promise<FleetMetrics> {
  const [events, knives] = await Promise.all([
    prisma.knifeEvent.findMany({
      orderBy: { createdAt: "asc" },
      select: { knifeId: true, action: true, createdAt: true },
    }),
    prisma.knife.findMany({ select: { id: true, number: true } }),
  ]);
  const numById = new Map(knives.map((k) => [k.id, k.number]));

  const checkoutCount = new Map<number, number>();
  let qaPass = 0;
  let qaFail = 0;
  const lastReturn = new Map<number, Date>();
  const turnarounds: number[] = [];

  for (const e of events) {
    switch (e.action) {
      case "CHECKOUT":
        checkoutCount.set(e.knifeId, (checkoutCount.get(e.knifeId) ?? 0) + 1);
        break;
      case "RETURN":
        // Start of the sanitation+QA turnaround clock for this knife.
        lastReturn.set(e.knifeId, e.createdAt);
        break;
      case "QA_FAIL":
        qaFail++;
        break;
      case "QA_PASS": {
        qaPass++;
        const r = lastReturn.get(e.knifeId);
        if (r) {
          turnarounds.push(e.createdAt.getTime() - r.getTime());
          lastReturn.delete(e.knifeId);
        }
        break;
      }
    }
  }

  const totalCheckouts = [...checkoutCount.values()].reduce((a, b) => a + b, 0);
  const qaTotal = qaPass + qaFail;
  const avgTurnaroundMs = turnarounds.length
    ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length
    : null;
  const mostUsed = [...checkoutCount.entries()]
    .map(([id, count]) => ({ number: numById.get(id) ?? String(id), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalCheckouts,
    qaPass,
    qaFail,
    qaFailRate: qaTotal ? qaFail / qaTotal : null,
    cyclesMeasured: turnarounds.length,
    avgTurnaroundMs,
    mostUsed,
  };
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = mins / 60;
  if (hours < 24) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}
