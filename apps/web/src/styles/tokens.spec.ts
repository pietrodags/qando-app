import { describe, expect, it } from 'vitest';
import { contrastRatio, readCustomProperties } from './contrast';
import tokensSource from './_tokens.scss' with { loader: 'text' };

// Read inside each test, never when the file loads: a value built at load time turns the
// helpers' mutants static, which mutation testing can only check by running every test.
function tokens(): Map<string, string> {
  return readCustomProperties(tokensSource);
}

function token(name: string): string {
  const value = tokens().get(name);
  if (value === undefined) {
    throw new Error(`Missing token: ${name}`);
  }
  return value;
}

/** Colour stops of a gradient token, so text over it is checked against each stop. */
function stops(name: string): string[] {
  const value = token(name);
  const colours = value.match(/#[0-9a-f]{3,6}\b|rgba?\([^)]*\)/gi);
  return colours ?? [value];
}

/** Surfaces text is drawn on. Gradients are expanded into their stops. */
const neutralSurfaces = ['--q-page-bg', '--q-surface', '--q-card-bg', '--q-button-bg'];

/** Surfaces of the thank-you card: its green background and the buttons on it. */
const successSurfaces = ['--q-success-bg', '--q-button-bg'];

/**
 * Every text colour token with the surfaces it is drawn on. WCAG 2.2 AA (1.4.3): at least 4.5:1.
 * Disabled and inactive text is exempt and is not listed.
 */
const textPairs: Record<string, string[]> = {
  '--q-text': [...neutralSurfaces, ...successSurfaces],
  '--q-text-strong': [...neutralSurfaces, ...successSurfaces],
  '--q-text-heading': [...neutralSurfaces, ...successSurfaces],
  '--q-text-emph': [...neutralSurfaces, ...successSurfaces],
  '--q-text-label': [...neutralSurfaces, '--q-results-bg'],
  '--q-text-muted': neutralSurfaces,
  '--q-text-subtle': neutralSurfaces,
  '--q-text-day-header': neutralSurfaces,
  '--q-text-results-label': ['--q-results-bg'],
  '--q-text-option-flexible': ['--q-button-bg'],
  '--q-text-option-choose': ['--q-button-bg'],
  '--q-on-available': ['--q-available-bg', '--q-available-soft-bg', '--q-results-bg'],
  '--q-on-preferred': ['--q-preferred-bg', '--q-available-bg', '--q-available-soft-bg'],
  '--q-on-unavailable': ['--q-unavailable-bg'],
  '--q-on-unavailable-bar': ['--q-unavailable-bg'],
  '--q-on-toast': ['--q-toast-bg'],
  '--q-on-action': ['--q-action-bg'],
  '--q-on-notice-info': ['--q-notice-info-bg'],
  '--q-on-notice-error': ['--q-notice-error-bg'],
};

/**
 * Text deliberately below 4.5:1, by product decision, with the surface it is drawn on.
 * Each one must still be below 4.5:1, so an exception that is no longer needed is removed.
 */
const contrastExceptions: Record<string, { surface: string; reason: string }> = {
  '--q-on-range-middle': {
    surface: '--q-available-bg',
    reason: 'middle days of a date range look secondary, like a disabled control',
  },
  '--q-on-unavailable-range-middle': {
    surface: '--q-unavailable-bg',
    reason: 'the same, for a range answered "No puedo": its first and last days stand out',
  },
};

/** Non-text indicators that must stay visible (WCAG 1.4.11): at least 3:1. */
const indicatorPairs: Record<string, string[]> = {
  '--q-focus-color': [...neutralSurfaces, '--q-available-bg', '--q-unavailable-bg'],
  '--q-danger': neutralSurfaces,
  // The thank-you icon: its meaning is the white tick, drawn on the green circle.
  '--q-success-check': ['--q-success-icon'],
};

/** One case per text and surface; a gradient surface's stops are checked inside the test. */
function cases(pairs: Record<string, string[]>) {
  return Object.entries(pairs).flatMap(([text, surfaces]) =>
    surfaces.map((surface) => ({ text, surface })),
  );
}

describe('design tokens', () => {
  it.each(cases(textPairs))('$text on $surface is at least 4.5:1', ({ text, surface }) => {
    for (const background of stops(surface)) {
      expect(contrastRatio(token(text), background), background).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(cases(indicatorPairs))('$text on $surface is at least 3:1', ({ text, surface }) => {
    for (const background of stops(surface)) {
      expect(contrastRatio(token(text), background), background).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(Object.entries(contrastExceptions))(
    '%s is a listed exception below 4.5:1',
    (name, { surface }) => {
      expect(contrastRatio(token(name), token(surface))).toBeLessThan(4.5);
    },
  );

  it('checks every text colour token except disabled and inactive text', () => {
    const textTokens = [...tokens().keys()].filter(
      (name) =>
        (name.startsWith('--q-text-') || name === '--q-text' || name.startsWith('--q-on-')) &&
        !/-(disabled|inactive)\b/.test(name) &&
        !(name in contrastExceptions),
    );
    expect(textTokens.sort()).toEqual(Object.keys(textPairs).sort());
  });

  it('turns every duration off when the user prefers reduced motion', () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(
      tokensSource,
    )?.[1];
    const durations = [...tokens().keys()].filter((name) => name.includes('-duration'));
    expect(durations.length).toBeGreaterThan(0);
    for (const name of durations) {
      expect(reduced, name).toMatch(new RegExp(`${name}\\s*:\\s*0ms`));
    }
  });
});
