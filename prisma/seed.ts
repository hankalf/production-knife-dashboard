import { PrismaClient } from "@prisma/client";
import { hashPin } from "../src/lib/crypto";

const prisma = new PrismaClient();

// The current fleet: 42 knives labelled 1–14, 51–64, 65–78.
function knifeNumbers(): number[] {
  const ranges: [number, number][] = [
    [1, 14],
    [51, 64],
    [65, 78],
  ];
  const nums: number[] = [];
  for (const [start, end] of ranges) {
    for (let n = start; n <= end; n++) nums.push(n);
  }
  return nums;
}

// Starter workers so every role can be exercised immediately.
// PINs are only defaults — change them in the Admin screen.
const workers = [
  { name: "Admin", pin: "0000", roles: "ADMIN,OPERATOR,SANITATION,QA" },
  { name: "Olivia (Operator)", pin: "1111", roles: "OPERATOR" },
  { name: "Sam (Sanitation)", pin: "2222", roles: "SANITATION" },
  { name: "Quinn (QA)", pin: "3333", roles: "QA" },
];

async function main() {
  // Knives — idempotent upsert so re-seeding never duplicates.
  for (const n of knifeNumbers()) {
    await prisma.knife.upsert({
      where: { number: String(n) },
      update: {},
      create: { number: String(n), sortKey: n, status: "AVAILABLE" },
    });
  }

  // Workers.
  for (const w of workers) {
    const existing = await prisma.worker.findFirst({ where: { name: w.name } });
    if (existing) continue;
    await prisma.worker.create({
      data: { name: w.name, pin: hashPin(w.pin), roles: w.roles, active: true },
    });
  }

  // Settings.
  await prisma.setting.upsert({
    where: { key: "checkoutWindowHours" },
    update: {},
    create: { key: "checkoutWindowHours", value: "24" },
  });

  const knifeCount = await prisma.knife.count();
  const workerCount = await prisma.worker.count();
  console.log(`Seed complete: ${knifeCount} knives, ${workerCount} workers.`);
  console.log("Default PINs — Admin 0000, Operator 1111, Sanitation 2222, QA 3333");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
