#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  let root = REPO_ROOT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && i + 1 < args.length) {
      root = resolve(args[i + 1]);
      i++;
    }
  }
  return { root };
}

function shouldSkipDir(dirName) {
  return (
    dirName === 'node_modules' ||
    dirName === '.git' ||
    dirName === '.expo' ||
    dirName === 'dist' ||
    dirName === 'build' ||
    dirName === 'android' ||
    dirName === 'ios' ||
    dirName.startsWith('.')
  );
}

function isTestFile(filePath) {
  return (
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('/__tests__/') ||
    filePath.includes('/__mocks__/')
  );
}

function walkDir(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) {
        walkDir(fullPath, files);
      }
    } else if (entry.isFile()) {
      const isSourceFile = /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name);
      const isRulesFile = entry.name === 'firestore.rules';
      if (isSourceFile || isRulesFile) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function readLines(filePath) {
  try {
    return readFileSync(filePath, 'utf-8').split('\n');
  } catch {
    return [];
  }
}

const rules = [
  {
    name: 'expo-haptics',
    check(filePath, lines, relPath) {
      if (relPath === 'apps/mobile/src/lib/haptics.ts') return [];
      if (relPath.startsWith('scripts/check-invariants')) return [];
      const violations = [];
      for (let i = 0; i < lines.length; i++) {
        if (/expo-haptics/.test(lines[i])) {
          violations.push({ line: i + 1, message: 'expo-haptics imported outside haptics.ts' });
        }
      }
      return violations;
    },
  },
  {
    name: 'shared-no-react-native-firebase',
    check(filePath, lines, relPath) {
      if (!relPath.startsWith('packages/shared/src/')) return [];
      const forbidden = [
        'react',
        'react-native',
        '@react-native-firebase',
        'firebase',
        'firebase-admin',
      ];
      const violations = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const imp of forbidden) {
          const escapedImp = imp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = new RegExp(`from\\s+['"]${escapedImp}(/|['"])|import\\s+.*from\\s+['"]${escapedImp}(/|['"])|require\\(['"]${escapedImp}(/|['"])\\)`);
          if (pattern.test(line)) {
            violations.push({ line: i + 1, message: `forbidden import: ${imp}` });
            break;
          }
        }
      }
      return violations;
    },
  },
  {
    name: 'shared-sms-no-console',
    check(filePath, lines, relPath) {
      if (!relPath.startsWith('packages/shared/src/sms/')) return [];
      const violations = [];
      for (let i = 0; i < lines.length; i++) {
        if (/console\./.test(lines[i])) {
          violations.push({ line: i + 1, message: 'console call in shared/sms' });
        }
      }
      return violations;
    },
  },
  {
    name: 'onboarding-no-permission-request',
    check(filePath, lines, relPath) {
      const onboardingPaths = [
        'apps/mobile/src/app/onboarding/',
        'apps/mobile/src/features/onboarding/',
      ];
      if (!onboardingPaths.some((p) => relPath.startsWith(p))) return [];
      const patterns = [
        'requestPermissions',
        'PermissionsAndroid',
        'request.*PermissionsAsync',
      ];
      const violations = [];
      for (let i = 0; i < lines.length; i++) {
        for (const pat of patterns) {
          if (new RegExp(pat).test(lines[i])) {
            violations.push({ line: i + 1, message: 'permission request in onboarding' });
            break;
          }
        }
      }
      return violations;
    },
  },
  {
    name: 'mobile-no-push-registration',
    check(filePath, lines, relPath) {
      if (!relPath.startsWith('apps/mobile/src/')) return [];
      const patterns = [
        'getExpoPushTokenAsync',
        'getDevicePushTokenAsync',
        'registerForPushNotifications',
      ];
      const violations = [];
      for (let i = 0; i < lines.length; i++) {
        for (const pat of patterns) {
          if (new RegExp(pat).test(lines[i])) {
            violations.push({ line: i + 1, message: 'push notification registration' });
            break;
          }
        }
      }
      return violations;
    },
  },
  {
    name: 'pending-expenses-location',
    check(filePath, lines, relPath) {
      if (!lines.some((l) => /pendingExpenses/.test(l))) return [];
      const allowedPaths = [
        'packages/shared/src/firestore/',
        'packages/shared/src/sms/',
        'apps/mobile/src/features/inbox/',
        'functions/src/cleanup.ts',
        'firestore.rules',
      ];
      const isAllowed =
        allowedPaths.some((p) => relPath.startsWith(p)) ||
        relPath === 'firestore.rules' ||
        relPath.startsWith('scripts/check-invariants') ||
        isTestFile(filePath);
      if (isAllowed) return [];
      const violations = [];
      for (let i = 0; i < lines.length; i++) {
        if (/pendingExpenses/.test(lines[i])) {
          violations.push({ line: i + 1, message: 'pendingExpenses used in disallowed location' });
        }
      }
      return violations;
    },
  },
];

function main() {
  const { root } = parseArgs();
  const files = walkDir(root);
  let hasViolations = false;

  for (const filePath of files) {
    const relPath = relative(root, filePath).replace(/\\/g, '/');
    const lines = readLines(filePath);

    for (const rule of rules) {
      const violations = rule.check(filePath, lines, relPath);
      for (const v of violations) {
        hasViolations = true;
        console.log(`${relPath}:${v.line} ${rule.name}`);
      }
    }
  }

  if (hasViolations) {
    process.exit(1);
  }
}

main();