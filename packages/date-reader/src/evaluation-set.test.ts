// The evaluation set: phrases an organizer may write, each with the day it is written on, the
// region of the browser and the answer the owner expects: the options, the questions and the
// notices with their fragments and dates, all in the phrase's order. The agreed score is 100 %:
// a case that stops passing fails the tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readDates, type DatesRead } from './index.js';

interface EvaluationCase {
  id: string;
  lang: string;
  text: string;
  today: string;
  region: string;
  expected: DatesRead;
}

const { cases } = JSON.parse(
  readFileSync(new URL('./evaluation-set.json', import.meta.url), 'utf8'),
) as { cases: EvaluationCase[] };

const read = ({ text, today, region }: EvaluationCase): DatesRead =>
  readDates(text, { today, region });

function passes(item: EvaluationCase): boolean {
  try {
    return JSON.stringify(read(item)) === JSON.stringify(item.expected);
  } catch {
    return false;
  }
}

describe('the evaluation set', () => {
  it.each(cases.map((item) => [item.id, item.text, item] as const))(
    '%s: %s',
    (_id, _text, item) => {
      expect(read(item)).toEqual(item.expected);
    },
  );

  it('has cases in Spanish, Catalan and English', () => {
    expect([...new Set(cases.map((item) => item.lang))].sort()).toEqual(['ca', 'en', 'es']);
  });

  it('is read whole: the agreed score is 100 %', () => {
    const passed = cases.filter(passes).length;
    expect(cases.length).toBeGreaterThan(0);
    expect(passed / cases.length).toBe(1);
  });
});
