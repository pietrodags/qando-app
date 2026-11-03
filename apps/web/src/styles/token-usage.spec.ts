import { describe, expect, it } from 'vitest';
import { literalValues } from './token-usage';

describe('literalValues', () => {
  it('accepts a stylesheet built only from tokens', () => {
    const css = `
      .card {
        padding: var(--q-space-8) var(--q-space-10);
        color: var(--q-text);
        border: 0;
        display: flex;
        width: 100%;
        transition: opacity var(--q-duration-base) var(--q-ease);
        @include bp.from-tablet { gap: var(--q-space-5); }
      }`;
    expect(literalValues(css)).toEqual([]);
  });

  it('reports colours, lengths and durations written by hand', () => {
    const css =
      '.a { color: #555; background: rgba(0, 0, 0, 0.1); margin: 12px 1.5rem; transition: all .3s; }';
    expect(literalValues(css)).toEqual(['#555', 'rgba(0, 0, 0, 0.1)', '12px', '1.5rem', '.3s']);
  });

  it('reports named colours', () => {
    expect(literalValues('.a { color: white; border-color: red; }')).toEqual(['white', 'red']);
  });

  it('ignores literals inside comments and selectors', () => {
    const css = '/* #fff 10px */ // 4px\n.w-10px, #main { color: var(--q-text); }';
    expect(literalValues(css)).toEqual([]);
  });
});
