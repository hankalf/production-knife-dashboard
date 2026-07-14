// Knife lifecycle statuses and the display metadata that drives the color-coded grid.

export const STATUS = {
  AVAILABLE: "AVAILABLE",
  CHECKED_OUT: "CHECKED_OUT",
  DIRTY: "DIRTY",
  CLEANED: "CLEANED",
  OUT_OF_SERVICE: "OUT_OF_SERVICE",
} as const;

export type Status = (typeof STATUS)[keyof typeof STATUS];

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
  CLEANED: {
    label: "Awaiting QA",
    tile: "bg-violet-500 hover:bg-violet-600 text-white border-violet-600",
    dot: "bg-violet-500",
  },
  OUT_OF_SERVICE: {
    label: "Out of service",
    tile: "bg-slate-400 hover:bg-slate-500 text-white border-slate-500",
    dot: "bg-slate-400",
  },
};

// Order the legend / summary counts follow.
export const DISPLAY_ORDER: DisplayState[] = [
  "AVAILABLE",
  "CHECKED_OUT",
  "OVERDUE",
  "DIRTY",
  "CLEANED",
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
  return parseRoles(roles).includes(role);
}

// Human labels for audit actions.
export const ACTION_LABEL: Record<string, string> = {
  CHECKOUT: "Checked out",
  RETURN: "Returned (used)",
  CLEAN: "Cleaned",
  QA_PASS: "QA passed",
  QA_FAIL: "QA failed",
  RETIRE: "Retired",
  RESTORE: "Restored",
  ADD: "Added to fleet",
};
