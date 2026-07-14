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
import { ROLE, STATUS, hasRole, canAccessAdmin, type Role } from "@/lib/status";

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
  { ok: true; workerId: number; roles: string } | { ok: false; error: string }
> {
  const worker = await getCurrentWorker();
  if (!worker) return { ok: false, error: "Sign in with your PIN first." };
  if (!hasRole(worker.roles, role)) {
    return { ok: false, error: `This action requires the ${role} role.` };
  }
  return { ok: true, workerId: worker.id, roles: worker.roles };
}

// Admin panel is open to admins and QA.
async function requirePanelAccess(): Promise<
  { ok: true; workerId: number; roles: string } | { ok: false; error: string }
> {
  const worker = await getCurrentWorker();
  if (!worker) return { ok: false, error: "Sign in with your PIN first." };
  if (!canAccessAdmin(worker.roles)) {
    return { ok: false, error: "The admin panel is limited to admins and QA." };
  }
  return { ok: true, workerId: worker.id, roles: worker.roles };
}

type Actor = { workerId: number; roles: string };
type GuardContext = Actor;

type TransitionOpts = {
  action: string;
  from: string[]; // allowed source statuses
  to: string;
  role: Role;
  note?: string;
  // extra data to write onto the knife
  data?: Record<string, unknown>;
  // optional extra check (e.g. "only the operator who checked it out may return it")
  guard?: (
    knife: { checkedOutById: number | null; number: string },
    ctx: GuardContext
  ) => string | null;
};

// Core transition, given an already-resolved actor. Used by both the
// session-based board actions and the PIN-based kiosk actions.
async function applyTransition(
  knifeId: number,
  opts: TransitionOpts,
  actor: Actor,
  // When the caller already authorized the actor (e.g. panel access covers
  // this action), skip the single-role check.
  authorized = false
): Promise<ActionResult> {
  if (!authorized && !hasRole(actor.roles, opts.role)) {
    return fail(`This action requires the ${opts.role} role.`);
  }
  try {
    await prisma.$transaction(async (tx) => {
      const knife = await tx.knife.findUnique({ where: { id: knifeId } });
      if (!knife) throw new Error("Knife not found.");
      if (!opts.from.includes(knife.status)) {
        throw new Error(
          `Knife #${knife.number} is "${knife.status}" and cannot be ${opts.action}.`
        );
      }
      if (opts.guard) {
        const err = opts.guard(knife, actor);
        if (err) throw new Error(err);
      }
      await tx.knife.update({
        where: { id: knifeId },
        data: { status: opts.to, ...(opts.data ?? {}) },
      });
      await tx.knifeEvent.create({
        data: {
          knifeId,
          workerId: actor.workerId,
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

// Session-based transition (main board): actor comes from the signed-in cookie.
async function transition(knifeId: number, opts: TransitionOpts): Promise<ActionResult> {
  const auth = await requireWorkerWithRole(opts.role);
  if (!auth.ok) return fail(auth.error);
  return applyTransition(knifeId, opts, { workerId: auth.workerId, roles: auth.roles });
}

// Resolve a worker from a raw PIN (for the shared kiosk, which has no session).
async function actorFromPin(pin: string): Promise<Actor | null> {
  const clean = (pin || "").trim();
  if (!clean) return null;
  const workers = await prisma.worker.findMany({ where: { active: true } });
  const worker = workers.find((w) => verifyPin(clean, w.pin));
  return worker ? { workerId: worker.id, roles: worker.roles } : null;
}

// Build the transition options for a given kiosk action.
async function kioskOpts(action: "CHECKOUT" | "RETURN" | "CLEAN", actor: Actor): Promise<TransitionOpts> {
  if (action === "CHECKOUT") {
    const hours = await getCheckoutWindowHours();
    const now = new Date();
    const due = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return {
      action: "CHECKOUT",
      from: [STATUS.AVAILABLE],
      to: STATUS.CHECKED_OUT,
      role: ROLE.OPERATOR,
      data: { checkedOutById: actor.workerId, checkedOutAt: now, dueAt: due },
    };
  }
  if (action === "RETURN") {
    return {
      action: "RETURN",
      from: [STATUS.CHECKED_OUT],
      to: STATUS.DIRTY,
      role: ROLE.OPERATOR,
      data: { checkedOutById: null, checkedOutAt: null, dueAt: null },
      guard: (knife, ctx) =>
        knife.checkedOutById === ctx.workerId || hasRole(ctx.roles, ROLE.ADMIN)
          ? null
          : `Knife #${knife.number} was checked out by someone else — only they (or an admin) can return it.`,
    };
  }
  return {
    action: "CLEAN",
    from: [STATUS.DIRTY],
    to: STATUS.CLEANED,
    role: ROLE.SANITATION,
  };
}

// ---- Kiosk lock (supervisor view-only toggle) -----------------------------

async function writeKioskLocked(locked: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "kioskLocked" },
    update: { value: String(locked) },
    create: { key: "kioskLocked", value: String(locked) },
  });
  revalidatePath("/", "layout");
}

// From the Admin panel (signed-in admin).
export async function setKioskLocked(locked: boolean): Promise<ActionResult> {
  const auth = await requirePanelAccess();
  if (!auth.ok) return fail(auth.error);
  await writeKioskLocked(locked);
  return ok();
}

// From the kiosk itself — a supervisor confirms with their PIN.
export async function setKioskLockedWithPin(
  locked: boolean,
  pin: string
): Promise<ActionResult> {
  const actor = await actorFromPin(pin);
  if (!actor) return fail("PIN not recognized.");
  if (!canAccessAdmin(actor.roles)) {
    return fail("Only an admin or QA can lock or unlock the kiosk.");
  }
  await writeKioskLocked(locked);
  return ok();
}

// Kiosk action: identify by PIN, then run the transition. Operators can
// check out / check in; sanitation can clean. QA/admin use the main board.
export async function kioskAct(
  knifeId: number,
  action: "CHECKOUT" | "RETURN" | "CLEAN",
  pin: string,
  note?: string
): Promise<ActionResult> {
  // Respect the supervisor lock even if a client bypasses the disabled UI.
  const locked = await prisma.setting.findUnique({ where: { key: "kioskLocked" } });
  if (locked?.value === "true") return fail("The kiosk is locked. Ask a supervisor to unlock it.");

  const actor = await actorFromPin(pin);
  if (!actor) return fail("PIN not recognized.");
  const opts = await kioskOpts(action, actor);
  const trimmed = (note || "").trim();
  if (trimmed) opts.note = trimmed;
  return applyTransition(knifeId, opts, actor);
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
    // Only the operator who holds the knife may return it (admins can override).
    guard: (knife, ctx) =>
      knife.checkedOutById === ctx.workerId || hasRole(ctx.roles, ROLE.ADMIN)
        ? null
        : `Knife #${knife.number} was checked out by someone else — only they (or an admin) can return it.`,
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

// ---- Batch actions (sanitation / QA move many knives at once) --------------

export type BatchResult = { ok: boolean; done: number; failed: number; error?: string };

async function runBatch(
  ids: number[],
  fn: (id: number) => Promise<ActionResult>
): Promise<BatchResult> {
  let done = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const id of ids) {
    const res = await fn(id);
    if (res.ok) done++;
    else {
      failed++;
      if (!firstError) firstError = res.error;
    }
  }
  return { ok: done > 0, done, failed, error: failed > 0 ? firstError : undefined };
}

export async function batchClean(ids: number[]): Promise<BatchResult> {
  return runBatch(ids, cleanKnife);
}

export async function batchQaPass(ids: number[]): Promise<BatchResult> {
  return runBatch(ids, qaPassKnife);
}

export async function retireKnife(knifeId: number, reason: string): Promise<ActionResult> {
  const auth = await requirePanelAccess();
  if (!auth.ok) return fail(auth.error);
  return applyTransition(
    knifeId,
    {
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
    },
    { workerId: auth.workerId, roles: auth.roles },
    true
  );
}

export async function restoreKnife(knifeId: number): Promise<ActionResult> {
  const auth = await requirePanelAccess();
  if (!auth.ok) return fail(auth.error);
  return applyTransition(
    knifeId,
    {
      action: "RESTORE",
      from: [STATUS.OUT_OF_SERVICE],
      to: STATUS.DIRTY,
      role: ROLE.ADMIN,
      data: { retiredAt: null },
    },
    { workerId: auth.workerId, roles: auth.roles },
    true
  );
}

// ---- Admin: fleet & workers ----------------------------------------------

export async function addKnife(number: string): Promise<ActionResult> {
  const auth = await requirePanelAccess();
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
  const auth = await requirePanelAccess();
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

// Count active admins other than `excludeId` — used to prevent locking
// everyone out by removing/deactivating the last admin.
async function activeAdminsExcluding(excludeId: number): Promise<number> {
  const workers = await prisma.worker.findMany({ where: { active: true } });
  return workers.filter((w) => w.id !== excludeId && hasRole(w.roles, ROLE.ADMIN)).length;
}

export async function setWorkerActive(
  workerId: number,
  active: boolean
): Promise<ActionResult> {
  const auth = await requirePanelAccess();
  if (!auth.ok) return fail(auth.error);
  const target = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!target) return fail("Worker not found.");
  if (!active && hasRole(target.roles, ROLE.ADMIN) && (await activeAdminsExcluding(workerId)) === 0) {
    return fail("You can't deactivate the last admin — add another admin first.");
  }
  await prisma.worker.update({ where: { id: workerId }, data: { active } });
  revalidatePath("/", "layout");
  return ok();
}

export async function updateWorker(
  workerId: number,
  input: { name: string; roles: string[]; pin?: string }
): Promise<ActionResult> {
  const auth = await requirePanelAccess();
  if (!auth.ok) return fail(auth.error);

  const cleanName = (input.name || "").trim();
  if (!cleanName) return fail("Name is required.");
  const validRoles = input.roles.filter((r) => r in ROLE);
  if (validRoles.length === 0) return fail("Select at least one role.");

  const target = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!target) return fail("Worker not found.");

  // Don't let the last admin drop their own ADMIN role.
  const losingAdmin = hasRole(target.roles, ROLE.ADMIN) && !validRoles.includes(ROLE.ADMIN);
  if (losingAdmin && target.active && (await activeAdminsExcluding(workerId)) === 0) {
    return fail("You can't remove the last admin's ADMIN role — add another admin first.");
  }

  const data: { name: string; roles: string; pin?: string } = {
    name: cleanName,
    roles: validRoles.join(","),
  };

  const newPin = (input.pin || "").trim();
  if (newPin) {
    if (!/^\d{4,8}$/.test(newPin)) return fail("PIN must be 4–8 digits.");
    const others = await prisma.worker.findMany({ where: { id: { not: workerId } } });
    if (others.some((w) => verifyPin(newPin, w.pin))) {
      return fail("That PIN is already in use — choose another.");
    }
    data.pin = hashPin(newPin);
  }

  await prisma.worker.update({ where: { id: workerId }, data });
  revalidatePath("/", "layout");
  return ok();
}

export async function deleteWorker(workerId: number): Promise<ActionResult> {
  const auth = await requirePanelAccess();
  if (!auth.ok) return fail(auth.error);

  const target = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!target) return fail("Worker not found.");

  // Protect the audit trail: anyone with recorded activity can only be deactivated.
  const eventCount = await prisma.knifeEvent.count({ where: { workerId } });
  if (eventCount > 0) {
    return fail(
      "This employee has activity history — deactivate them instead so the audit trail stays intact."
    );
  }
  if (await prisma.knife.count({ where: { checkedOutById: workerId } })) {
    return fail("This employee currently holds a knife — return it first.");
  }
  if (hasRole(target.roles, ROLE.ADMIN) && target.active && (await activeAdminsExcluding(workerId)) === 0) {
    return fail("You can't remove the last admin — add another admin first.");
  }

  await prisma.worker.delete({ where: { id: workerId } });
  revalidatePath("/", "layout");
  return ok();
}

// Email alert *preferences* only — delivery is not wired up yet, so this
// simply persists what an admin wants; nothing is sent.
export async function updateEmailSettings(input: {
  enabled: boolean;
  recipients: string;
  notifyOverdue: boolean;
  notifyDailySweep: boolean;
}): Promise<ActionResult> {
  const auth = await requirePanelAccess();
  if (!auth.ok) return fail(auth.error);

  const recipients = input.recipients
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const bad = recipients.find((r) => !emailRe.test(r));
  if (bad) return fail(`"${bad}" is not a valid email address.`);
  if (input.enabled && recipients.length === 0) {
    return fail("Add at least one recipient before enabling email alerts.");
  }
  if (input.enabled && !input.notifyOverdue && !input.notifyDailySweep) {
    return fail("Choose at least one thing to be notified about.");
  }

  const entries: [string, string][] = [
    ["email.enabled", String(input.enabled)],
    ["email.recipients", recipients.join(",")],
    ["email.notifyOverdue", String(input.notifyOverdue)],
    ["email.notifyDailySweep", String(input.notifyDailySweep)],
  ];
  for (const [key, value] of entries) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  revalidatePath("/", "layout");
  return ok();
}

export async function updateCheckoutWindow(hours: number): Promise<ActionResult> {
  const auth = await requirePanelAccess();
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
