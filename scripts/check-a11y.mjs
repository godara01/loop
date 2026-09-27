#!/usr/bin/env node
/**
 * Accessibility + testID audit for apps/mobile/src.
 *
 *   node scripts/check-a11y.mjs [--root <repo>] [--json] [--max N]
 *
 * Parses every .tsx with the TypeScript compiler API (no regex over JSX) and
 * finds the interactive elements: Pressable, TouchableOpacity,
 * TouchableHighlight, TextInput, Switch, Button, and the project's own
 * TactileButton. Each is reported when it lacks
 *   - a testID (Maestro can't reach it), or
 *   - an accessible name/role: accessibilityLabel or accessibilityRole
 *     (TactileButton's `label` prop becomes its accessibilityLabel and it
 *     always sets role "button", so a `label` satisfies it; a TextInput's
 *     placeholder is read by screen readers and counts as its name).
 * A `{...spread}` attribute may carry either, so it counts as present.
 *
 * Prints the findings and the total. Exits 0 unless --max N is given and the
 * count exceeds N — the ratchet for CI (H4 drives it to --max 0).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const INTERACTIVE = new Set([
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TextInput',
  'Switch',
  'Button',
  'TactileButton',
]);

function parseArgs(argv) {
  const opts = { root: REPO_ROOT, json: false, max: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') opts.root = resolve(argv[++i]);
    else if (argv[i] === '--json') opts.json = true;
    else if (argv[i] === '--max') {
      opts.max = Number(argv[++i]);
      if (!Number.isInteger(opts.max) || opts.max < 0) throw new Error('--max needs a non-negative integer');
    }
  }
  return opts;
}

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) files.push(full);
  }
  return files;
}

function tagName(node) {
  const name = node.tagName;
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isPropertyAccessExpression(name)) return name.name.text; // Animated.Pressable -> Pressable
  return null;
}

function auditFile(file, root) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagName(node);
      if (tag && INTERACTIVE.has(tag)) {
        const attrs = new Set();
        let spread = false;
        for (const prop of node.attributes.properties) {
          if (ts.isJsxSpreadAttribute(prop)) spread = true;
          else if (prop.name) attrs.add(prop.name.getText(source));
        }
        const missing = [];
        if (!spread && !attrs.has('testID')) missing.push('testID');
        const named =
          attrs.has('accessibilityLabel') ||
          attrs.has('accessibilityRole') ||
          (tag === 'TactileButton' && attrs.has('label')) ||
          (tag === 'TextInput' && attrs.has('placeholder')) ||
          (tag === 'Button' && attrs.has('title'));
        if (!spread && !named) missing.push('accessibilityLabel/accessibilityRole');
        if (missing.length > 0) {
          const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
          findings.push({ file: relative(root, file), line: line + 1, column: character + 1, element: tag, missing });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const findings = walk(join(opts.root, 'apps', 'mobile', 'src')).flatMap((file) => auditFile(file, opts.root));

  if (opts.json) {
    console.log(JSON.stringify({ count: findings.length, findings }, null, 2));
  } else {
    for (const f of findings) console.log(`${f.file}:${f.line}:${f.column}  <${f.element}> missing ${f.missing.join(' and ')}`);
    console.log(`check:a11y — ${findings.length} finding(s)${opts.max === null ? '' : ` (max ${opts.max})`}`);
  }
  if (opts.max !== null && findings.length > opts.max) process.exit(1);
}

main();
