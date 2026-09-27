#!/usr/bin/env node
/**
 * Every Maestro `id:` selector must name a testID that exists in the app.
 *
 * A flow that taps an id nobody renders only fails on a device, minutes into a
 * run. This catches the rename at code level instead.
 *
 *   node scripts/check-testids.mjs [--root <repo>]
 *
 * Literal testIDs (testID="x", testID={'x'}, and every quoted string inside a
 * testID={...} expression) are collected from apps/mobile/src. Ids built from
 * a template literal can't be known statically, so they pass only through
 * TEMPLATE_ALLOWLIST below — and each allowlist entry must itself still match a
 * template testID in the source, so a stale entry fails too.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

/**
 * Template-built ids. `prefix` is the literal text before the first `${`; an
 * e2e id starting with it is accepted.
 */
const TEMPLATE_ALLOWLIST = [
  // category-strip.tsx: `category-chip-${category.slug}` — FOOD, TRANSPORT, ...
  { prefix: 'category-chip-' },
  // catalogue-screen: `catalogue-item-${item.slug}`
  { prefix: 'catalogue-item-' },
  // category editor colour swatches: `color-${token}` — color-amber, ...
  { prefix: 'color-' },
  // category editor glyph grid: `glyph-${glyph}`
  { prefix: 'glyph-' },
  // amount-pad.tsx: `pad-key-${keyId(key)}` — pad-key-0..9, pad-key-backspace
  { prefix: 'pad-key-' },
  // manage-categories rows and their actions: `manage-*-${item.slug}`
  { prefix: 'manage-row-' },
  { prefix: 'manage-archive-' },
  { prefix: 'manage-unarchive-' },
  { prefix: 'manage-delete-' },
  // insights: `insights-category-${row.categoryId}`, `insights-period-${kind}`,
  // `insights-day-${day.date}` (today's is the literal 'insights-day-today')
  { prefix: 'insights-category-' },
  { prefix: 'insights-period-' },
  { prefix: 'insights-day-' },
  // tab-dock.tsx: `tab-${route.name}` — tab-orbit, tab-insights, ...
  { prefix: 'tab-' },
  // onboarding pickers: `onboarding-category-${cat.id}`, `onboarding-currency-${code}`
  { prefix: 'onboarding-category-' },
  { prefix: 'onboarding-currency-' },
  // ledger/expense rows keyed by date or id
  { prefix: 'ledger-day-' },
  { prefix: 'expense-row-' },
  // inbox (U2): `inbox-day-${date}`, `pending-card-${id}` and its -amount,
  // -category-<slug>, -approve, -edit, -dismiss children
  { prefix: 'inbox-day-' },
  { prefix: 'pending-card-' },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--root');
  return { root: i >= 0 && args[i + 1] ? resolve(args[i + 1]) : REPO_ROOT };
}

function walk(dir, accept, files = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, accept, files);
    else if (accept(entry.name)) files.push(full);
  }
  return files;
}

/** Every `id:` selector value in the flows, with where it was used. */
function collectFlowIds(root) {
  const ids = [];
  for (const file of walk(join(root, 'e2e'), (name) => /\.ya?ml$/.test(name))) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const match = line.match(/^\s*(?:-\s*)?id:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))/);
        if (match) ids.push({ id: match[1] ?? match[2] ?? match[3], at: `${relative(root, file)}:${index + 1}` });
      });
  }
  return ids;
}

/** Literal testIDs, plus the static prefixes of template-built ones. */
function collectSourceIds(root) {
  const literals = new Set();
  const templatePrefixes = new Set();
  for (const file of walk(join(root, 'apps', 'mobile', 'src'), (name) => /\.(tsx?|jsx?)$/.test(name))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/testID=(?:"([^"]*)"|'([^']*)')/g)) literals.add(m[1] ?? m[2]);
    for (const m of text.matchAll(/testID=\{([^}]*(?:\$\{[^}]*\}[^}]*)*)\}/g)) {
      const expr = m[1];
      for (const s of expr.matchAll(/'([^']*)'|"([^"]*)"/g)) literals.add(s[1] ?? s[2]);
      for (const t of expr.matchAll(/`([^`$]*)\$\{/g)) templatePrefixes.add(t[1]);
      for (const t of expr.matchAll(/`([^`$]*)`/g)) literals.add(t[1]);
    }
  }
  return { literals, templatePrefixes };
}

function main() {
  const { root } = parseArgs();
  const flowIds = collectFlowIds(root);
  const { literals, templatePrefixes } = collectSourceIds(root);
  const problems = [];

  for (const { prefix } of TEMPLATE_ALLOWLIST) {
    if (!templatePrefixes.has(prefix)) {
      problems.push(`allowlist entry '${prefix}' matches no template testID in apps/mobile/src — remove or fix it`);
    }
  }

  for (const { id, at } of flowIds) {
    if (literals.has(id)) continue;
    if (TEMPLATE_ALLOWLIST.some(({ prefix }) => id.startsWith(prefix) && id.length > prefix.length)) continue;
    problems.push(`${at}: id "${id}" is not a testID anywhere in apps/mobile/src`);
  }

  if (problems.length > 0) {
    console.error(`check:testids — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`check:testids — ${flowIds.length} id selectors, all found (${literals.size} literal testIDs, ${TEMPLATE_ALLOWLIST.length} template prefixes).`);
}

main();
