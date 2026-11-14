// The evaluation set: phrases an organizer may write, each with the day it is written on, the
// region of the browser and the options the owner expects. The agreed score is 100 %: a case
// that stops passing fails the tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readDates, type DatesRead, type ReadNotice, type ReadOption } from './index.js';

interface EvaluationCase {
  id: string;
  lang: string;
  text: string;
  today: string;
  region: string;
  expected: { options: ReadOption[]; notUnderstood: string[]; notice?: ReadNotice | null };
}

const { cases } = JSON.parse(
  readFileSync(new URL('./evaluation-set.json', import.meta.url), 'utf8'),
) as { cases: EvaluationCase[] };

/** The options whatever their order. */
const canon = (options: ReadOption[]) =>
  options.map((option) => JSON.stringify([option.dates, option.time])).sort();

const read = ({ text, today, region }: EvaluationCase): DatesRead =>
  readDates(text, { today, region });

/** What a case expects of the answer: the options, whether something was not understood, the notice. */
function expectationsOf({ expected }: EvaluationCase, answer: DatesRead) {
  return [
    { got: canon(answer.options), expected: canon(expected.options) },
    { got: answer.notUnderstood.length > 0, expected: expected.notUnderstood.length > 0 },
    ...(expected.notice === undefined ? [] : [{ got: answer.notice, expected: expected.notice }]),
  ];
}

function passes(item: EvaluationCase): boolean {
  try {
    return expectationsOf(item, read(item)).every(
      ({ got, expected }) => JSON.stringify(got) === JSON.stringify(expected),
    );
  } catch {
    return false;
  }
}

describe('the evaluation set', () => {
  it.each(cases.map((item) => [item.id, item.text, item] as const))(
    '%s: %s',
    (_id, _text, item) => {
      const answer = read(item);
      for (const { got, expected } of expectationsOf(item, answer)) expect(got).toEqual(expected);
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
