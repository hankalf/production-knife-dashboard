"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifyPin, hashPin } from "@/lib/crypto";
import {
  getCurrentWorker,
  setCurrentWorker,
  clearCurrentWorker,
} from "@/lib/session";
import { getCheckoutWindowHours } from "@/lib/data";
import { ROLE, STATUS, hasRole, type Role } from "@/lib/status";

export type ActionResult = { ok: boolean; error?: string };

function ok(): ActionResult {
  return { ok: true };
}
function fail(error: string): ActionResult {
  return { ok: false, error };
}

// ---- Identity -------------------------------------------------------------

export async function login(pin: string): Promise<ActionResult> {
  const clean = (pin || "").trim();
  if (!clean) return fail("Enter your PIN.");
  const workers = await prisma.worker.findMany({ where: { active: true } });
  const match = workers.find((w) => verifyPin(clean, w.pin));
  if (!match) return fail("PIN not recognized.");
  await setCurrentWorker(match.id);
  revalidatePath("/", "layout");
  return ok();
}

export async function logout(): Promise<ActionResult> {
  await clearCurrentWorker();
  revalidatePath("/", "layout");
  return ok();
}

// ---- Shared transition core ----------------------------------------------

async function requireWorkerWithRole(role: Role): Promise<
  { ok: true; workerId: number } | { ok: false; error: string }
> {
  const worker = await getCurrentWorker();
  if (!worker) return { ok: false, error: "Sign in with your PIN first." };
  if (!hasRole(worker.roles, role)) {
    return { ok: false, error: `This action requires the ${role} role.` };
  }
  return { ok: true, workerId: worker.id };
}

type TransitionOpts = {
  action: string;
  from: string[]; // allowed source statuses
  to: string;
  role: Role;
  note?: string;
  // extra data to write onto the knife
  data?: Record<string, unknown>;
};

async function transition(knifeId: number, opts: TransitionOpts): Promise<ActionResult> {
  const auth = await requireWorkerWithRole(opts.role);
  if (!auth.ok) return fail(auth.error);

  try {
    await prisma.$transaction(async (tx) => {
      const knife = await tx.knife.findUnique({ where: { id: knifeId } });
      if (!knife) throw new Error("Knife not found.");
      if (!opts.from.includes(knife.status)) {
        throw new Error(
          `Knife #${knife.number} is "${knife.status}" and cannot be ${opts.action}.`
        );
      }
      await tx.knife.update({
        where: { id: knifeId },
        data: { status: opts.to, ...(opts.data ?? {}) },
      });
      await tx.knifeEvent.create({
        data: {
          knifeId,
          workerId: auth.workerId,
          action: opts.action,
          fromStatus: knife.status,
          toStatus: opts.to,
          note: opts.note ?? null,
        },
      });
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Transition failed.");
  }

  revalidatePath("/", "layout");
  return ok();
}

// ---- Lifecycle actions ----------------------------------------------------

export async function checkoutKnife(knifeId: number): Promise<ActionResult> {
  const auth = await requireWorkerWithRole(ROLE.OPERATOR);
  if (!auth.ok) return fail(auth.error);
  const hours = await getCheckoutWindowHours();
  const now = new Date();
  const due = new Date(now.getTime() + hours * 60 * 60 * 1000);
  return transition(knifeId, {
    action: "CHECKOUT",
    from: [STATUS.AVAILABLE],
    to: STATUS.CHECKED_OUT,
    role: ROLE.OPERATOR,
    data: { checkedOutById: auth.workerId, checkedOutAt: now, dueAt: due },
  });
}

export async function returnKnife(knifeId: number): Promise<ActionResult> {
  return transition(knifeId, {
    action: "RETURN",
    from: [STATUS.CHECKED_OUT],
    to: STATUS.DIRTY,
    role: ROLE.OPERATOR,
    data: { checkedOutById: null, checkedOutAt: null, dueAt: null },
  });
}

export async function cleanKnife(knifeId: number): Promise<ActionResult> {
  return transition(knifeId, {
    action: "CLEAN",
    from: [STATUS.DIRTY],
    to: STATUS.CLEANED,
    role: ROLE.SANITATION,
  });
}

export async function qaPassKnife(knifeId: number): Promise<ActionResult> {
  return transition(knifeId, {
    action: "QA_PASS",
    from: [STATUS.CLEANED],
    to: STATUS.AVAILABLE,
    role: ROLE.QA,
    data: { checkedOutById: null, checkedOutAt: null, dueAt: null },
  });
}

export async function qaFailKnife(knifeId: number, reason: string): Promise<ActionResult> {
  const note = (reason || "").trim();
  if (!note) return fail("A reason is required to fail QA.");
  return transition(knifeId, {
    action: "QA_FAIL",
    from: [STATUS.CLEANED],
    to: STATUS.DIRTY,
    role: ROLE.QA,
    note,
  });
}

export async function retireKnife(knifeId: number, reason: string): Promise<ActionResult> {
  return transition(knifeId, {
    action: "RETIRE",
    from: [STATUS.AVAILABLE, STATUS.CHECKED_OUT, STATUS.DIRTY, STATUS.CLEANED],
    to: STATUS.OUT_OF_SERVICE,
    role: ROLE.ADMIN,
    note: (reason || "").trim() || undefined,
    data: {
      retiredAt: new Date(),
      checkedOutById: null,
      checkedOutAt: null,
      dueAt: null,
    },
  });
}

export async function restoreKnife(knifeId: number): Promise<ActionResult> {
  return transition(knifeId, {
    action: "RESTORE",
    from: [STATUS.OUT_OF_SERVICE],
    to: STATUS.DIRTY,
    role: ROLE.ADMIN,
    data: { retiredAt: null },
  });
}

// ---- Admin: fleet & workers ----------------------------------------------

export async function addKnife(number: string): Promise<ActionResult> {
  const auth = await requireWorkerWithRole(ROLE.ADMIN);
  if (!auth.ok) return fail(auth.error);
  const label = (number || "").trim();
  if (!/^\d+$/.test(label)) return fail("Knife number must be a positive whole number.");
  const sortKey = Number(label);

  const existing = await prisma.knife.findUnique({ where: { number: label } });
  if (existing) return fail(`Knife #${label} already exists.`);

  try {
    await prisma.$transaction(async (tx) => {
      const knife = await tx.knife.create({
        data: { number: label, sortKey, status: STATUS.AVAILABLE },
      });
      await tx.knifeEvent.create({
        data: {
          knifeId: knife.id,
          workerId: auth.workerId,
          action: "ADD",
          fromStatus: null,
          toStatus: STATUS.AVAILABLE,
          note: "Added to fleet",
        },
      });
    });
  } catch {
    return fail("Could not add knife.");
  }
  revalidatePath("/", "layout");
  return ok();
}

export async function addWorker(
  name: string,
  pin: string,
  roles: string[]
): Promise<ActionResult> {
  const auth = await requireWorkerWithRole(ROLE.ADMIN);
  if (!auth.ok) return fail(auth.error);
  const cleanName = (name || "").trim();
  const cleanPin = (pin || "").trim();
  if (!cleanName) return fail("Name is required.");
  if (!/^\d{4,8}$/.test(cleanPin)) return fail("PIN must be 4–8 digits.");
  const validRoles = roles.filter((r) => r in ROLE);
  if (validRoles.length === 0) return fail("Select at least one role.");

  // Ensure PIN is unique (compare against all stored hashes).
  const all = await prisma.worker.findMany();
  if (all.some((w) => verifyPin(cleanPin, w.pin))) {
    return fail("That PIN is already in use — choose another.");
  }

  try {
    await prisma.worker.create({
      data: { name: cleanName, pin: hashPin(cleanPin), roles: validRoles.join(","), active: true },
    });
  } catch {
    return fail("Could not add worker.");
  }
  revalidatePath("/", "layout");
  return ok();
}

export async function setWorkerActive(
  workerId: number,
  active: boolean
): Promise<ActionResult> {
  const auth = await requireWorkerWithRole(ROLE.ADMIN);
  if (!auth.ok) return fail(auth.error);
  await prisma.worker.update({ where: { id: workerId }, data: { active } });
  revalidatePath("/", "layout");
  return ok();
}

export async function updateCheckoutWindow(hours: number): Promise<ActionResult> {
  const auth = await requireWorkerWithRole(ROLE.ADMIN);
  if (!auth.ok) return fail(auth.error);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) {
    return fail("Enter a valid number of hours.");
  }
  await prisma.setting.upsert({
    where: { key: "checkoutWindowHours" },
    update: { value: String(hours) },
    create: { key: "checkoutWindowHours", value: String(hours) },
  });
  revalidatePath("/", "layout");
  return ok();
}
