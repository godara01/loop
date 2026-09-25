import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const SCRIPT = join(process.cwd(), 'scripts/check-invariants.mjs');

function runScript(rootDir) {
  return spawnSync('node', [SCRIPT, '--root', rootDir], {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });
}

function createFixture(rootDir, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(rootDir, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
}

describe('check-invariants positive control tests', () => {
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join('/tmp', 'invariants-test-'));
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('rule 1: expo-haptics imported outside haptics.ts', () => {
    const fixtureDir = join(tempDir, 'rule1');
    createFixture(fixtureDir, {
      'apps/mobile/src/components/BadComponent.tsx': `import * as Haptics from 'expo-haptics';
export const Bad = () => null;`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /expo-haptics/);
  });

  test('rule 2: shared imports react', () => {
    const fixtureDir = join(tempDir, 'rule2');
    createFixture(fixtureDir, {
      'packages/shared/src/utils.ts': `import React from 'react';
export const x = 1;`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /shared-no-react-native-firebase/);
  });

  test('rule 2: shared imports react-native', () => {
    const fixtureDir = join(tempDir, 'rule2-rn');
    createFixture(fixtureDir, {
      'packages/shared/src/utils.ts': `import { View } from 'react-native';
export const x = 1;`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /shared-no-react-native-firebase/);
  });

  test('rule 2: shared imports @react-native-firebase', () => {
    const fixtureDir = join(tempDir, 'rule2-rnf');
    createFixture(fixtureDir, {
      'packages/shared/src/utils.ts': `import firestore from '@react-native-firebase/firestore';
export const x = 1;`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /shared-no-react-native-firebase/);
  });

  test('rule 2: shared imports firebase', () => {
    const fixtureDir = join(tempDir, 'rule2-fb');
    createFixture(fixtureDir, {
      'packages/shared/src/utils.ts': `import firebase from 'firebase';
export const x = 1;`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /shared-no-react-native-firebase/);
  });

  test('rule 2: shared imports firebase-admin', () => {
    const fixtureDir = join(tempDir, 'rule2-fba');
    createFixture(fixtureDir, {
      'packages/shared/src/utils.ts': `import admin from 'firebase-admin';
export const x = 1;`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /shared-no-react-native-firebase/);
  });

  test('rule 3: console.log in shared/sms', () => {
    const fixtureDir = join(tempDir, 'rule3');
    createFixture(fixtureDir, {
      'packages/shared/src/sms/parser.ts': `export function parse() {
  console.log('debug');
  return null;
}`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /shared-sms-no-console/);
  });

  test('rule 4: requestPermissions in app/onboarding', () => {
    const fixtureDir = join(tempDir, 'rule4');
    createFixture(fixtureDir, {
      'apps/mobile/src/app/onboarding/step.tsx': `import { requestPermissions } from 'expo-permissions';
export const Step = () => null;`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /onboarding-no-permission-request/);
  });

  test('rule 4: PermissionsAndroid in features/onboarding', () => {
    const fixtureDir = join(tempDir, 'rule4-rn');
    createFixture(fixtureDir, {
      'apps/mobile/src/features/onboarding/screen.tsx': `import { PermissionsAndroid } from 'react-native';
export const Screen = () => null;`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /onboarding-no-permission-request/);
  });

  test('rule 4: requestCameraPermissionsAsync in app/onboarding', () => {
    const fixtureDir = join(tempDir, 'rule4-async');
    createFixture(fixtureDir, {
      'apps/mobile/src/app/onboarding/step.tsx': `import { requestCameraPermissionsAsync } from 'expo-camera';
export const Step = () => null;`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /onboarding-no-permission-request/);
  });

  test('rule 5: getExpoPushTokenAsync in mobile/src', () => {
    const fixtureDir = join(tempDir, 'rule5');
    createFixture(fixtureDir, {
      'apps/mobile/src/lib/notifications.ts': `import { getExpoPushTokenAsync } from 'expo-notifications';
export const setup = () => getExpoPushTokenAsync();`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /mobile-no-push-registration/);
  });

  test('rule 5: getDevicePushTokenAsync in mobile/src', () => {
    const fixtureDir = join(tempDir, 'rule5-dev');
    createFixture(fixtureDir, {
      'apps/mobile/src/lib/notifications.ts': `import { getDevicePushTokenAsync } from 'expo-notifications';
export const setup = () => getDevicePushTokenAsync();`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /mobile-no-push-registration/);
  });

  test('rule 5: registerForPushNotifications in mobile/src', () => {
    const fixtureDir = join(tempDir, 'rule5-reg');
    createFixture(fixtureDir, {
      'apps/mobile/src/lib/notifications.ts': `import { registerForPushNotifications } from 'expo-notifications';
export const setup = () => registerForPushNotifications();`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /mobile-no-push-registration/);
  });

  test('rule 6: pendingExpenses in disallowed location', () => {
    const fixtureDir = join(tempDir, 'rule6');
    createFixture(fixtureDir, {
      'apps/mobile/src/features/expenses/screen.tsx': `export const Screen = () => {
  const ref = db.collection('pendingExpenses');
  return null;
};`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /pending-expenses-location/);
  });

  test('rule 6: pendingExpenses allowed in shared/firestore', () => {
    const fixtureDir = join(tempDir, 'rule6-allowed-firestore');
    createFixture(fixtureDir, {
      'packages/shared/src/firestore/paths.ts': `export const pendingExpenses = 'pendingExpenses';`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 0);
  });

  test('rule 6: pendingExpenses allowed in shared/sms', () => {
    const fixtureDir = join(tempDir, 'rule6-allowed-sms');
    createFixture(fixtureDir, {
      'packages/shared/src/sms/types.ts': `export const pendingExpenses = 'pendingExpenses';`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 0);
  });

  test('rule 6: pendingExpenses allowed in mobile/features/inbox', () => {
    const fixtureDir = join(tempDir, 'rule6-allowed-inbox');
    createFixture(fixtureDir, {
      'apps/mobile/src/features/inbox/api/repo.ts': `export const pendingExpenses = 'pendingExpenses';`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 0);
  });

  test('rule 6: pendingExpenses allowed in functions/src/cleanup.ts', () => {
    const fixtureDir = join(tempDir, 'rule6-allowed-cleanup');
    createFixture(fixtureDir, {
      'functions/src/cleanup.ts': `export const pendingExpenses = 'pendingExpenses';`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 0);
  });

  test('rule 6: pendingExpenses allowed in firestore.rules', () => {
    const fixtureDir = join(tempDir, 'rule6-allowed-rules');
    createFixture(fixtureDir, {
      'firestore.rules': `match /pendingExpenses/{doc} { allow read; }`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 0);
  });

  test('rule 6: pendingExpenses allowed in test files', () => {
    const fixtureDir = join(tempDir, 'rule6-allowed-test');
    createFixture(fixtureDir, {
      'apps/mobile/src/features/expenses/screen.test.tsx': `export const pendingExpenses = 'pendingExpenses';`,
    });
    const result = runScript(fixtureDir);
    assert.strictEqual(result.status, 0);
  });

  test('clean repo passes', () => {
    const result = runScript(process.cwd());
    if (result.status !== 0) {
      console.log('STDOUT:', result.stdout);
      console.log('STDERR:', result.stderr);
    }
    assert.strictEqual(result.status, 0);
  });
});