/**
 * Writes deterministic fixture expenses into the LOCAL Firestore emulator for the
 * first (or given) user, and prints a JSON summary including expected totals.
 *
 *   npx tsx scripts/seed-emulator.ts --expenses 5000 --days 365 [--seed 7] [--uid <uid>]
 *
 * Refuses to run unless FIRESTORE_EMULATOR_HOST is set, so it cannot write to a
 * real project.
 */

import { parseArgs } from 'node:util';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import {
  ESSENTIAL_CATEGORIES,
  addDays,
  expenseToDoc,
  firestorePaths,
  money,
  newPersonalExpense,
  todayISO,
} from '../packages/shared/src/index';

process.env.FIRESTORE_EMULATOR_HOST ??= '';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to seed: FIRESTORE_EMULATOR_HOST is not set (e.g. 127.0.0.1:8080).');
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    expenses: { type: 'string', default: '200' },
    days: { type: 'string', default: '60' },
    seed: { type: 'string', default: '7' },
    uid: { type: 'string' },
  },
});

/** Small deterministic PRNG (mulberry32), so the same seed always writes the same data. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  const app = initializeApp({ projectId: 'loop-app-0403' });
  const db = getFirestore(app);

  let uid = values.uid;
  if (!uid) {
    const { users } = await getAuth(app).listUsers(1);
    uid = users[0]?.uid;
  }
  if (!uid) throw new Error('No user in the Auth emulator yet — open the app once first.');

  const count = Number(values.expenses);
  const days = Number(values.days);
  const random = prng(Number(values.seed));
  const today = todayISO();
  const now = new Date().toISOString();

  let totalMinor = 0;
  const byCategory: Record<string, number> = {};
  let batch = db.batch();
  let pending = 0;

  for (let i = 0; i < count; i += 1) {
    const day = addDays(today, -Math.floor(random() * days));
    const minute = Math.floor(random() * 24 * 60);
    const occurredAt = new Date(`${day}T00:00:00Z`);
    occurredAt.setUTCMinutes(minute);
    const occurred = occurredAt.toISOString() > now ? now : occurredAt.toISOString();
    const template = ESSENTIAL_CATEGORIES[Math.floor(random() * ESSENTIAL_CATEGORIES.length)]!;
    const categoryId = `cat-${template.slug.toLowerCase()}`;
    const minor = 1000 + Math.floor(random() * 200) * 500;

    const expense = newPersonalExpense({
      id: `seed-${String(i).padStart(6, '0')}`,
      uid,
      total: money(minor, 'INR'),
      categoryId,
      description: `${template.name} #${i}`,
      note: null,
      occurredAt: occurred,
      now,
    });
    batch.set(db.doc(firestorePaths.expense(uid, expense.id)), expenseToDoc(expense));
    totalMinor += minor;
    byCategory[categoryId] = (byCategory[categoryId] ?? 0) + minor;
    pending += 1;

    if (pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();

  console.log(JSON.stringify({ uid, expenses: count, days, totalMinor, byCategory }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
