/**
 * Finds values written by hand in a component stylesheet (colours, lengths, durations) that
 * should come from a design token. Only the test suite imports this file.
 */

export function literalValues(css: string): string[] {
  // Built here, not when the module loads: a value built at load time is a static mutant, which
  // mutation testing can only check by running every test.
  const literalPattern = new RegExp(
    [
      String.raw`#[0-9a-f]{3,8}\b`,
      String.raw`rgba?\([^)]*\)`,
      String.raw`hsla?\([^)]*\)`,
      String.raw`(?<![\w-])(?:\d+\.?\d*|\.\d+)(?:px|rem|em|ms|s|vh|vw)(?![\w-])`,
      String.raw`(?<![\w-])(?:white|black|red|green|blue|gray|grey|transparent)(?![\w-])`,
    ].join('|'),
    'gi',
  );
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const values: string[] = [];
  for (const [, declarations] of source.matchAll(/:\s*([^;{}]+)[;}]/g)) {
    const withoutTokens = (declarations ?? '').replace(/var\(--[\w-]+\)/g, '');
    values.push(...(withoutTokens.match(literalPattern) ?? []));
  }
  return values;
}
