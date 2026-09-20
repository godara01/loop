import { intensityStep } from '../../../packages/shared/src/insights';

console.log('Testing intensityStep function...');

const testCases = [
  // amountMinor, maximumMinor, expected
  [0, 100, 0],
  [1, 100, 1],
  [20, 100, 1],
  [21, 100, 2],
  [40, 100, 2],
  [41, 100, 3],
  [60, 100, 3],
  [61, 100, 4],
  [80, 100, 4],
  [81, 100, 5],
  [100, 100, 5],
  [150, 100, 5],
  [1000, 100, 5],
  // edge cases
  [0, 0, 0],
  [50, 0, 0],
  [50, -10, 0],
];

let passed = 0;
let failed = 0;

for (const [amountMinor, maximumMinor, expected] of testCases) {
  const result = intensityStep(amountMinor, maximumMinor);
  if (result === expected) {
    console.log(`✓ intensityStep(${amountMinor}, ${maximumMinor}) = ${result}`);
    passed++;
  } else {
    console.error(`✗ intensityStep(${amountMinor}, ${maximumMinor}) = ${result}, expected ${expected}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed.');
  process.exit(0);
}
