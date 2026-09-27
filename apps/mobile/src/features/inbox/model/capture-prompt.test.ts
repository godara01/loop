import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import { CAPTURE_EXPLAINER, shouldShowCapturePrompt } from './capture-prompt';

describe('shouldShowCapturePrompt', () => {
  it('is false below 3 manual expenses', () => {
    for (const count of [0, 1, 2]) assert.equal(shouldShowCapturePrompt(count, 'unseen'), false);
  });

  it('is true at 3 (and after) while never shown', () => {
    assert.equal(shouldShowCapturePrompt(3, 'unseen'), true);
    assert.equal(shouldShowCapturePrompt(40, 'unseen'), true);
  });

  it('is false once shown, dismissed, denied or granted — it never asks twice', () => {
    for (const state of ['shown', 'dismissed', 'denied', 'granted'] as const) {
      assert.equal(shouldShowCapturePrompt(3, state), false, state);
      assert.equal(shouldShowCapturePrompt(50, state), false, state);
    }
  });
});

describe('explainer copy', () => {
  it('is word for word from docs/12', () => {
    let dir = process.cwd();
    while (!existsSync(join(dir, 'docs/12-sms-ingest.md'))) dir = dirname(dir);
    const doc = readFileSync(join(dir, 'docs/12-sms-ingest.md'), 'utf8').replace(/\s+/g, ' ');
    assert.ok(doc.includes(`*"${CAPTURE_EXPLAINER}"*`));
  });
});
