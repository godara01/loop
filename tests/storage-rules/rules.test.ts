/**
 * Storage security rules, tested like code. See storage.rules and
 * docs/11-firebase.md#security-rules.
 *
 * Run with `npm run test:rules`, which starts the Storage emulator alongside
 * Firestore's and shuts both down after. The project id is a `demo-` id, so
 * this can never touch a real bucket.
 *
 * `rules-unit-testing`'s storage context is the COMPAT SDK (`firebase.storage.Storage`,
 * not the modular `firebase/storage`) — see `RulesTestContext.storage()` in
 * `@firebase/rules-unit-testing`'s own type definitions. Every call here uses
 * that namespaced API, deliberately different from the Firestore rules test
 * file next to it.
 */

import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

import { MAX_LOGO_BYTES } from '../../packages/shared/src/categories';

const ALICE = 'alice';
const BOB = 'bob';

const SMALL_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-loop',
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearStorage();
});

after(async () => {
  await env.cleanup();
});

describe('category logos', () => {
  const path = (uid: string) => `users/${uid}/categoryLogos/cat-gym`;

  it('lets the owner upload a small image and read it back', async () => {
    const ref = env.authenticatedContext(ALICE).storage().ref(path(ALICE));
    await assertSucceeds(ref.put(SMALL_PNG, { contentType: 'image/png' }));
    await assertSucceeds(ref.getDownloadURL());
  });

  it("refuses another user's upload into someone else's logo path", async () => {
    const ref = env.authenticatedContext(BOB).storage().ref(path(ALICE));
    await assertFails(ref.put(SMALL_PNG, { contentType: 'image/png' }));
  });

  it('refuses a signed-out upload', async () => {
    const ref = env.unauthenticatedContext().storage().ref(path(ALICE));
    await assertFails(ref.put(SMALL_PNG, { contentType: 'image/png' }));
  });

  it('refuses a non-image content type', async () => {
    const ref = env.authenticatedContext(ALICE).storage().ref(path(ALICE));
    await assertFails(ref.put(SMALL_PNG, { contentType: 'application/pdf' }));
  });

  it('refuses a file over the ceiling packages/shared also enforces', async () => {
    const oversized = new Uint8Array(MAX_LOGO_BYTES + 1);
    const ref = env.authenticatedContext(ALICE).storage().ref(path(ALICE));
    await assertFails(ref.put(oversized, { contentType: 'image/png' }));
  });

  it('accepts a file exactly at the ceiling', async () => {
    const exact = new Uint8Array(MAX_LOGO_BYTES);
    const ref = env.authenticatedContext(ALICE).storage().ref(path(ALICE));
    await assertSucceeds(ref.put(exact, { contentType: 'image/png' }));
  });
});

describe('receipts', () => {
  const path = (uid: string) => `users/${uid}/receipts/e-1`;

  it('lets the owner upload and read', async () => {
    const ref = env.authenticatedContext(ALICE).storage().ref(path(ALICE));
    await assertSucceeds(ref.put(SMALL_PNG, { contentType: 'image/jpeg' }));
    await assertSucceeds(ref.getDownloadURL());
  });

  it("keeps one user out of another's receipts", async () => {
    const ref = env.authenticatedContext(BOB).storage().ref(path(ALICE));
    await assertFails(ref.put(SMALL_PNG, { contentType: 'image/jpeg' }));
    await assertFails(env.authenticatedContext(BOB).storage().ref(path(ALICE)).getDownloadURL());
  });
});

describe('everything else', () => {
  it('is denied by the catch-all', async () => {
    const ref = env.authenticatedContext(ALICE).storage().ref('scratch/anything.png');
    await assertFails(ref.put(SMALL_PNG, { contentType: 'image/png' }));
  });
});
