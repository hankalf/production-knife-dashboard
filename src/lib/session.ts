import { cookies } from "next/headers";
import { prisma } from "./prisma";

const COOKIE = "knife_worker";

export type CurrentWorker = {
  id: number;
  name: string;
  roles: string;
};

// The worker is identified by a signed-in PIN; we store only their id in a cookie.
export async function getCurrentWorker(): Promise<CurrentWorker | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isInteger(id)) return null;
  const worker = await prisma.worker.findFirst({
    where: { id, active: true },
    select: { id: true, name: true, roles: true },
  });
  return worker ?? null;
}

export async function setCurrentWorker(id: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, String(id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Short-lived shift session; workers re-enter their PIN each shift.
    maxAge: 60 * 60 * 12,
  });
}

export async function clearCurrentWorker(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
