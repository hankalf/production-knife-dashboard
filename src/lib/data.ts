import { prisma } from "./prisma";

export async function getCheckoutWindowHours(): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key: "checkoutWindowHours" } });
  const n = s ? Number(s.value) : 24;
  return Number.isFinite(n) && n > 0 ? n : 24;
}

export type EmailSettings = {
  enabled: boolean;
  recipients: string; // raw comma-separated list
  notifyOverdue: boolean;
  notifyDailySweep: boolean;
};

const EMAIL_KEYS = [
  "email.enabled",
  "email.recipients",
  "email.notifyOverdue",
  "email.notifyDailySweep",
] as const;

export async function getEmailSettings(): Promise<EmailSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...EMAIL_KEYS] } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    enabled: map.get("email.enabled") === "true",
    recipients: map.get("email.recipients") ?? "",
    // categories default to on so they're pre-checked when first enabling
    notifyOverdue: (map.get("email.notifyOverdue") ?? "true") === "true",
    notifyDailySweep: (map.get("email.notifyDailySweep") ?? "true") === "true",
  };
}

// When true, the shared kiosk is view-only until a supervisor unlocks it.
export async function getKioskLocked(): Promise<boolean> {
  const s = await prisma.setting.findUnique({ where: { key: "kioskLocked" } });
  return s?.value === "true";
}

export async function getKnives() {
  return prisma.knife.findMany({
    orderBy: { sortKey: "asc" },
    include: { checkedOutBy: { select: { name: true } } },
  });
}

export type KnifeWithHolder = Awaited<ReturnType<typeof getKnives>>[number];

export async function getKnifeByNumber(number: string) {
  return prisma.knife.findUnique({
    where: { number },
    include: {
      checkedOutBy: { select: { name: true } },
      events: {
        orderBy: { createdAt: "desc" },
        include: { worker: { select: { name: true } } },
      },
    },
  });
}

export async function getWorkers() {
  return prisma.worker.findMany({ orderBy: { name: "asc" } });
}

export async function getRecentEvents(limit = 100) {
  return prisma.knifeEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      worker: { select: { name: true } },
      knife: { select: { number: true } },
    },
  });
}

export async function getAllEventsForExport() {
  return prisma.knifeEvent.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      worker: { select: { name: true } },
      knife: { select: { number: true } },
    },
  });
}
