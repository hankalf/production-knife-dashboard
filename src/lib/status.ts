// Knife lifecycle statuses and the display metadata that drives the color-coded grid.

export const STATUS = {
  AVAILABLE: "AVAILABLE",
  CHECKED_OUT: "CHECKED_OUT",
  DIRTY: "DIRTY",
  CLEANED: "CLEANED",
  OUT_OF_SERVICE: "OUT_OF_SERVICE",
} as const;

export type Status = (typeof STATUS)[keyof typeof STATUS];

// Knife type — whether the blade touches food.
export const KNIFE_TYPE = {
  FC: "FC", // Food Contact
  NFC: "NFC", // Non-Food Contact
} as const;

export type KnifeType = (typeof KNIFE_TYPE)[keyof typeof KNIFE_TYPE];

export const TYPE_META: Record<KnifeType, { label: string; short: string; badge: string; dot: string }> = {
  FC: {
    label: "Food Contact",
    short: "FC",
    badge: "bg-blue-600 text-white",
    dot: "bg-blue-600",
  },
  NFC: {
    label: "Non-Food Contact",
    short: "NFC",
    badge: "bg-slate-300 text-slate-800",
    dot: "bg-slate-300 border border-slate-400",
  },
};

export function normalizeType(type: string): KnifeType {
  return type === "NFC" ? "NFC" : "FC";
}

export const ROLE = {
  OPERATOR: "OPERATOR",
  SANITATION: "SANITATION",
  QA: "QA",
  ADMIN: "ADMIN",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

// "OVERDUE" is a derived display state (a CHECKED_OUT knife past its due time),
// not a stored status. We give it its own visual key.
export type DisplayState = Status | "OVERDUE";

type StatusMeta = {
  label: string;
  // Tailwind classes for the grid tile and the small legend dot.
  tile: string;
  dot: string;
};

export const STATUS_META: Record<DisplayState, StatusMeta> = {
  AVAILABLE: {
    label: "Available",
    tile: "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600",
    dot: "bg-emerald-500",
  },
  CHECKED_OUT: {
    label: "Checked out",
    tile: "bg-sky-500 hover:bg-sky-600 text-white border-sky-600",
    dot: "bg-sky-500",
  },
  OVERDUE: {
    label: "Overdue",
    tile: "bg-red-600 hover:bg-red-700 text-white border-red-700 animate-pulse",
    dot: "bg-red-600",
  },
  DIRTY: {
    label: "Awaiting sanitation",
    tile: "bg-orange-500 hover:bg-orange-600 text-white border-orange-600",
    dot: "bg-orange-500",
  },
  // Legacy state from when a QA-inspection step existed; kept so any knife
  // still in this state renders (sanitation can clean it back to Available).
  CLEANED: {
    label: "Cleaned (legacy)",
    tile: "bg-violet-500 hover:bg-violet-600 text-white border-violet-600",
    dot: "bg-violet-500",
  },
  OUT_OF_SERVICE: {
    label: "Out of service",
    tile: "bg-slate-400 hover:bg-slate-500 text-white border-slate-500",
    dot: "bg-slate-400",
  },
};

// Order the legend / summary counts follow. (CLEANED is legacy-only and
// intentionally omitted — cleaning now returns a knife straight to Available.)
export const DISPLAY_ORDER: DisplayState[] = [
  "AVAILABLE",
  "CHECKED_OUT",
  "OVERDUE",
  "DIRTY",
  "OUT_OF_SERVICE",
];

export function isOverdue(status: string, dueAt: Date | null | undefined): boolean {
  return status === STATUS.CHECKED_OUT && !!dueAt && dueAt.getTime() < Date.now();
}

// The display state used for coloring, folding in the derived OVERDUE state.
export function displayState(status: string, dueAt: Date | null | undefined): DisplayState {
  if (isOverdue(status, dueAt)) return "OVERDUE";
  return status as Status;
}

export function parseRoles(roles: string): Role[] {
  return roles
    .split(",")
    .map((r) => r.trim().toUpperCase())
    .filter((r): r is Role => r in ROLE);
}

export function hasRole(roles: string, role: Role): boolean {
  const parsed = parseRoles(roles);
  // Admins can perform every function (operator, sanitation, QA, admin).
  if (parsed.includes(ROLE.ADMIN)) return true;
  return parsed.includes(role);
}

// Who may open the admin panel: admins and QA.
export function canAccessAdmin(roles: string): boolean {
  const parsed = parseRoles(roles);
  return parsed.includes(ROLE.ADMIN) || parsed.includes(ROLE.QA);
}

// The capabilities a worker effectively has — admins get every function.
// Used for client-side button gating so the UI matches `hasRole`.
export function effectiveRoles(roles: string): Role[] {
  const parsed = parseRoles(roles);
  if (parsed.includes(ROLE.ADMIN)) {
    return [ROLE.OPERATOR, ROLE.SANITATION, ROLE.QA, ROLE.ADMIN];
  }
  return parsed;
}

// Human labels for audit actions.
export const ACTION_LABEL: Record<string, string> = {
  CHECKOUT: "Checked out",
  RETURN: "Returned (used)",
  CLEAN: "Cleaned & returned to service",
  // Historical actions from when a QA-inspection step existed.
  QA_PASS: "QA passed",
  QA_FAIL: "QA failed",
  RETIRE: "Retired",
  RESTORE: "Restored",
  ADD: "Added to fleet",
  RETYPE: "Type changed",
};
