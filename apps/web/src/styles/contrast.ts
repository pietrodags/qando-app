/**
 * Colour contrast helpers for the design-token tests (WCAG 2.2 relative luminance).
 * Only the test suite imports this file; it never reaches the app bundle.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const hexPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;
const rgbPattern = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

export function parseColor(css: string): Rgba {
  const value = css.trim().toLowerCase();
  const hex = hexPattern.exec(value)?.[1];
  if (hex !== undefined) {
    const full = hex.length === 3 ? hex.replace(/./g, (digit) => digit + digit) : hex;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = rgbPattern.exec(value);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: Number(rgb[4] ?? 1) };
  }
  throw new Error(`Unsupported colour: ${css.trim()}`);
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function blend(top: Rgba, bottom: Rgba): Rgba {
  const mix = (front: number, back: number) => front * top.a + back * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/** Contrast ratio (1–21) of a text colour, translucent or not, over an opaque background. */
export function contrastRatio(text: string, background: string): number {
  const bg = parseColor(background);
  if (bg.a !== 1) {
    throw new Error(`Background must be opaque: ${background.trim()}`);
  }
  const a = luminance(blend(parseColor(text), bg));
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const declarationPattern = /(--[\w-]+)\s*:\s*([^;}]+)/g;
const referencePattern = /var\((--[\w-]+)\)/g;

/**
 * Custom properties declared in a stylesheet, with `var()` references resolved.
 * The first declaration of a name wins, so overrides inside media queries are ignored.
 */
export function readCustomProperties(css: string): Map<string, string> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const raw = new Map<string, string>();
  for (const [, name, value] of source.matchAll(declarationPattern)) {
    if (name !== undefined && value !== undefined && !raw.has(name)) {
      raw.set(name, value.trim());
    }
  }
  const resolve = (value: string): string =>
    value.replace(referencePattern, (_, name: string) => {
      const referenced = raw.get(name);
      if (referenced === undefined) {
        throw new Error(`Undeclared custom property: ${name}`);
      }
      return resolve(referenced);
    });
  return new Map([...raw].map(([name, value]) => [name, resolve(value)]));
}
