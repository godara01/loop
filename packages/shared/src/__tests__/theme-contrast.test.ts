/**
 * Category colours are the one part of the design system a user can reach, via
 * custom categories. This test is what stops the palette drifting into something
 * unreadable: every token is checked in both the roles it plays.
 *
 * A MonoTag is OUTLINED — the token tints the border and the text, drawn on a
 * card. A breakdown bar is FILLED — the token is the background and the text
 * sits on top of it. Both directions must clear WCAG AA (4.5:1).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATEGORY_COLOR_TOKENS, categoryColors, colors, palette } from '../theme';

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  assert.equal(clean.length, 6, `${hex} must be a 6-digit hex colour`);
  const r = channel(Number.parseInt(clean.slice(0, 2), 16));
  const g = channel(Number.parseInt(clean.slice(2, 4), 16));
  const b = channel(Number.parseInt(clean.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

const AA = 4.5;

describe('contrast maths', () => {
  it('agrees with the known extremes', () => {
    assert.equal(Math.round(contrast('#FFFFFF', '#000000')), 21);
    assert.equal(contrast('#FFFFFF', '#FFFFFF'), 1);
  });
});

describe('category colour tokens', () => {
  it('covers all eight tokens', () => {
    assert.equal(CATEGORY_COLOR_TOKENS.length, 8);
  });

  for (const token of CATEGORY_COLOR_TOKENS) {
    const { tint, onTint } = categoryColors[token];

    it(`${token} is readable as an outlined tag on a card`, () => {
      const ratio = contrast(tint, colors.card);
      assert.ok(ratio >= AA, `${token} tint ${tint} on card is ${ratio.toFixed(2)}:1`);
    });

    it(`${token} is readable as a filled plate`, () => {
      const ratio = contrast(onTint, tint);
      assert.ok(ratio >= AA, `${token} text ${onTint} on ${tint} is ${ratio.toFixed(2)}:1`);
    });

    it(`${token} is readable on the app background too`, () => {
      const ratio = contrast(tint, colors.background);
      assert.ok(ratio >= AA, `${token} tint ${tint} on background is ${ratio.toFixed(2)}:1`);
    });
  }
});

describe('the brand rule', () => {
  it('always puts Deep Void on Electric Lime', () => {
    assert.equal(categoryColors.lime.onTint, palette.void);
    assert.ok(contrast(palette.onAccent, palette.lime) >= AA);
  });

  it('tints violet categories with the light violet, since the social one is too dark to read', () => {
    assert.equal(categoryColors.violet.tint, palette.violetLight);
    assert.ok(
      contrast(palette.violet, colors.card) < AA,
      'if the structural violet ever becomes readable, simplify this',
    );
  });
});
