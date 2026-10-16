/**
 * The v1.2 ledger migration (docs/27-full-ledger-plan.md § Migration script).
 *
 *   npx tsx scripts/migrate-v2.ts --project <id> --yes [--from-uid <uid>]
 *
 * For every user: rebuild rollups v2 and account flows from `expenses`, seed
 * the income categories if missing, and write `users/{uid}/meta/schema =
 * { ledger: 2, migratedAt }`. 20 users at a time, idempotent, and resumable
 * with `--from-uid` (resumes AFTER that uid). Uses Application Default
 * Credentials, or the emulator when FIRESTORE_EMULATOR_HOST is set.
 */

import { parseArgs } from 'node:util';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { migrateAllUsers } from '../functions/src/migrate';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    yes: { type: 'boolean', default: false },
    'from-uid': { type: 'string' },
  },
});

if (!values.project) {
  console.error('Refusing to run: --project <id> is required.');
  process.exit(1);
}
if (!values.yes) {
  console.error(`Refusing to run: this rewrites every user's rollups in "${values.project}". Pass --yes to confirm.`);
  process.exit(1);
}

initializeApp({ projectId: values.project });
const db = getFirestore();
const target = process.env.FIRESTORE_EMULATOR_HOST ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST}` : 'LIVE project';
console.log(`migrate-v2: ${values.project} (${target})${values['from-uid'] ? `, after ${values['from-uid']}` : ''}`);

async function main(): Promise<void> {
  let processed = 0;
  const run = await migrateAllUsers(db, {
    now: new Date().toISOString(),
    fromUid: values['from-uid'],
    onBatch: (done) => {
      processed += done.length;
      const seeded = done.reduce((sum, user) => sum + user.incomeCategoriesSeeded, 0);
      // Uids only: never log transaction content.
      console.log(`  ${processed} users done (last ${done[done.length - 1]!.uid}, +${seeded} income categories)`);
    },
  });

  console.log(`migrate-v2: finished, ${run.users.length} users. Resume point: ${run.lastUid ?? '(none)'}`);
}

main().catch((error: unknown) => {
  console.error('migrate-v2 failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
