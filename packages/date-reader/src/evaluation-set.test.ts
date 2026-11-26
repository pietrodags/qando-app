// The evaluation set: phrases an organizer may write, each with the day it is written on, the
// region of the browser and the answer the owner expects: the options, the questions and the
// notices with their fragments and dates, all in the phrase's order. The agreed score is 100 %:
// a case that stops passing fails the tests.
import { readFileSync } from 'node:fs';
import { MAX_OPTIONS, type ProposedOption, validateOptions, withinOneHour } from '@qando/domain';
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

/**
 * The options of an answer that an event can take as they are: those whose time is still a
 * question are not options yet, and a time range that ends on the day after, or within the clock
 * hour it starts in, is one no event takes, which the wizard and the assistant leave out and tell.
 */
function optionsToPropose({ options }: DatesRead): ProposedOption[] {
  return options.flatMap(({ dates, time }): ProposedOption[] => {
    if (time === null) return [{ dates, time }];
    if (time.kind === 'question') return [];
    if (time.kind === 'range' && (time.nextDay || withinOneHour(time))) return [];
    return [{ dates, time }];
  });
}

describe('the evaluation set', () => {
  it.each(cases.map((item) => [item.id, item.text, item] as const))(
    '%s: %s',
    (_id, _text, item) => {
      expect(read(item)).toEqual(item.expected);
    },
  );

  it('gives only options that an event takes, by the rules of every list of options', () => {
    const refused = cases.flatMap((item) => {
      const answer = read(item);
      if (answer.options.length === 0) return [];
      const validation = validateOptions(optionsToPropose(answer), item.today);
      const tooMany = answer.options.length > MAX_OPTIONS;
      const problems = validation.ok ? [] : validation.problems;
      const others = problems.filter(({ code }) => code !== 'NO_OPTIONS');
      return tooMany || others.length > 0
        ? [{ id: item.id, text: item.text, tooMany, others }]
        : [];
    });

    expect(refused).toEqual([]);
  });

  it('has cases in Spanish, Catalan and English', () => {
    expect([...new Set(cases.map((item) => item.lang))].sort()).toEqual(['ca', 'en', 'es']);
  });

  it('is read whole: the agreed score is 100 %', () => {
    const passed = cases.filter(passes).length;
    expect(cases.length).toBeGreaterThan(0);
    expect(passed / cases.length).toBe(1);
  });
});
