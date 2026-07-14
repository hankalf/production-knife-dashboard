import { getCurrentWorker } from "@/lib/session";
import { PinPad } from "@/components/SessionControls";

export const dynamic = "force-dynamic";

// Everything except the kiosk lives under this group. Until a worker signs in
// with their PIN, the content is hidden behind a full-screen sign-in overlay.
export default async function GatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const worker = await getCurrentWorker();

  if (!worker) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
            <span aria-hidden>🔪</span> Safety Knife Checkout
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Enter your PIN to continue.
          </p>
        </div>
        <PinPad />
      </div>
    );
  }

  return <>{children}</>;
}
