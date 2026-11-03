import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor, readCustomProperties } from './contrast';

describe('parseColor', () => {
  it('reads six-digit hex colours', () => {
    expect(parseColor('#00695c')).toEqual({ r: 0, g: 105, b: 92, a: 1 });
  });

  it('reads three-digit hex colours', () => {
    expect(parseColor('#abc')).toEqual(parseColor('#aabbcc'));
  });

  it('ignores case and surrounding spaces', () => {
    expect(parseColor('  #FAB1A0 ')).toEqual({ r: 250, g: 177, b: 160, a: 1 });
  });

  it('reads rgb() and rgba()', () => {
    expect(parseColor('rgb(95, 165, 182)')).toEqual({ r: 95, g: 165, b: 182, a: 1 });
    expect(parseColor('rgba(0,0,0,0.6)')).toEqual({ r: 0, g: 0, b: 0, a: 0.6 });
  });

  it('rejects anything else', () => {
    expect(() => parseColor('teal')).toThrow('Unsupported colour: teal');
    expect(() => parseColor('#12345')).toThrow('Unsupported colour: #12345');
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#555', '#555')).toBeCloseTo(1, 5);
  });

  it('follows the WCAG relative luminance formula', () => {
    expect(contrastRatio('#777', '#fff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#555', '#f3f3f3')).toBeCloseTo(6.72, 2);
  });

  it('does not depend on which colour is the text', () => {
    expect(contrastRatio('#fff', '#333')).toBeCloseTo(contrastRatio('#333', '#fff'), 10);
  });

  it('blends a translucent text colour over its background first', () => {
    expect(contrastRatio('rgba(0,0,0,0.6)', '#f7f7fa')).toBeCloseTo(5.63, 2);
    expect(contrastRatio('rgba(0,0,0,0)', '#f7f7fa')).toBeCloseTo(1, 5);
  });

  it('needs an opaque background', () => {
    expect(() => contrastRatio('#000', 'rgba(255,255,255,0.5)')).toThrow(
      'Background must be opaque: rgba(255,255,255,0.5)',
    );
  });
});

describe('readCustomProperties', () => {
  it('reads the custom properties declared in the CSS', () => {
    const props = readCustomProperties(':root {\n  --a: #fff;\n  --b-2: 10px;\n}');
    expect(props.get('--a')).toBe('#fff');
    expect(props.get('--b-2')).toBe('10px');
    expect(props.size).toBe(2);
  });

  it('resolves var() references, also chained ones', () => {
    const props = readCustomProperties(':root { --a: #fff; --b: var(--a); --c: var(--b); }');
    expect(props.get('--c')).toBe('#fff');
  });

  it('ignores comments', () => {
    const props = readCustomProperties('/* --x: red; */ :root { --a: #fff; } // --y: blue;');
    expect([...props.keys()]).toEqual(['--a']);
  });

  it('keeps the first declaration, so media-query overrides do not replace it', () => {
    const props = readCustomProperties(
      ':root { --d: 300ms; } @media (prefers-reduced-motion: reduce) { :root { --d: 0ms; } }',
    );
    expect(props.get('--d')).toBe('300ms');
  });

  it('fails on a reference to an undeclared property', () => {
    expect(() => readCustomProperties(':root { --a: var(--missing); }')).toThrow(
      'Undeclared custom property: --missing',
    );
  });
});
