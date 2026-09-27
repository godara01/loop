import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import { EMPTY_STATES } from './empty-states';

function repoFile(relative: string): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, relative))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`${relative} not found above ${process.cwd()}`);
    dir = parent;
  }
  return readFileSync(join(dir, relative), 'utf8');
}

/** The doc's empty-state table: `| Surface | *"copy"* ... |`. */
function docCopy(): Map<string, string> {
  const doc = repoFile('docs/02-onboarding.md');
  const section = doc.slice(doc.indexOf('## Empty states after onboarding'), doc.indexOf('## Re-onboarding'));
  const copy = new Map<string, string>();
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    const surface = cells[1];
    const quoted = [...line.matchAll(/\*"([^"]+)"\*/g)].map((m) => m[1]!);
    if (surface && quoted.length > 0) copy.set(surface, quoted.at(-1)!);
  }
  return copy;
}

describe('empty-state copy', () => {
  const doc = docCopy();
  const expected: Record<keyof typeof EMPTY_STATES, string> = {
    orbit: 'Orbit',
    ledger: 'Ledger',
    insights: 'Insights',
    insightsThinData: 'Insights, <3 days of data',
    inbox: 'Inbox',
  };

  for (const [key, surface] of Object.entries(expected) as [keyof typeof EMPTY_STATES, string][]) {
    it(`${key} is the doc's ${surface} copy, verbatim`, () => {
      assert.ok(doc.has(surface), `docs/02 has no row for "${surface}"`);
      assert.equal(EMPTY_STATES[key], doc.get(surface));
    });
  }

  it('matches docs/12 for the inbox too', () => {
    // The doc wraps lines; compare with whitespace collapsed.
    assert.ok(repoFile('docs/12-sms-ingest.md').replace(/\s+/g, ' ').includes(EMPTY_STATES.inbox));
  });
});
