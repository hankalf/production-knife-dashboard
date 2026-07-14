import { getKnives } from "@/lib/data";
import KioskBoard, { type KioskKnife } from "@/components/KioskBoard";

export const dynamic = "force-dynamic";

// Full-screen, read-only board for a wall-mounted display. No sign-in, no actions.
export default async function KioskPage() {
  const knives = await getKnives();
  const dto: KioskKnife[] = knives.map((k) => ({
    id: k.id,
    number: k.number,
    status: k.status,
    dueAtMs: k.dueAt ? k.dueAt.getTime() : null,
  }));
  return <KioskBoard knives={dto} />;
}
