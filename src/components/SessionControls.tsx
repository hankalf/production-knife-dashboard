"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { login, logout } from "@/app/actions";

export function LogoutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await logout(); router.refresh(); })}
      disabled={pending}
      className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 disabled:opacity-50"
    >
      Sign out
    </button>
  );
}

export function PinPad() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function press(d: string) {
    setError(null);
    setPin((p) => (p.length >= 8 ? p : p + d));
  }
  function submit() {
    setError(null);
    start(async () => {
      const res = await login(pin);
      if (res.ok) {
        setPin("");
        router.refresh();
      } else {
        setError(res.error ?? "Sign in failed.");
        setPin("");
      }
    });
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="mx-auto max-w-xs w-full bg-white rounded-2xl shadow p-6">
      <h2 className="text-center text-lg font-semibold mb-1">Enter your PIN</h2>
      <p className="text-center text-xs text-slate-500 mb-4">
        Your role unlocks the actions you can take.
      </p>
      <div className="h-12 mb-3 rounded-lg border border-slate-300 flex items-center justify-center tracking-[0.5em] text-2xl font-mono">
        {pin.replace(/./g, "•") || <span className="text-slate-300 tracking-normal text-base">••••</span>}
      </div>
      {error && (
        <p className="text-center text-sm text-red-600 mb-3" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-xl font-semibold"
          >
            {k}
          </button>
        ))}
        <button
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-lg"
          aria-label="Delete"
        >
          ⌫
        </button>
        <button
          onClick={() => press("0")}
          className="h-14 rounded-lg bg-slate-100 hover:bg-slate-200 text-xl font-semibold"
        >
          0
        </button>
        <button
          onClick={submit}
          disabled={pending || pin.length === 0}
          className="h-14 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
        >
          {pending ? "…" : "Enter"}
        </button>
      </div>
    </div>
  );
}
