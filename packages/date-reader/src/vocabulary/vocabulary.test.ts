import { describe, expect, it } from 'vitest';
import { ca } from './ca.js';
import { en } from './en.js';
import { es } from './es.js';
import { shared } from './shared.js';
import type { Term } from './term.js';
import { vocabulary, wordsThatAreNotTypos } from './vocabulary.js';

const languages = { es, ca, en, shared };

/** Every phrase a language lists, with the term it gives it. */
const entriesOf = (words: readonly (readonly [Term, string])[]): [string, Term][] =>
  words.flatMap(([term, phrases]) =>
    phrases.split('|').map((phrase): [string, Term] => [phrase, term]),
  );

describe('vocabulary', () => {
  it('gives a word of each language the term it means', () => {
    const friday = { t: 'WD', v: 5 };

    expect(vocabulary().get('viernes')).toEqual(friday);
    expect(vocabulary().get('divendres')).toEqual(friday);
    expect(vocabulary().get('friday')).toEqual(friday);
    expect(vocabulary().get('@')).toEqual({ t: 'AT' });
  });

  it('holds phrases of several words and what a term needs besides its kind', () => {
    expect(vocabulary().get('fin de semana')).toEqual({ t: 'WEEKEND' });
    expect(vocabulary().get('cap de setmana')).toEqual({ t: 'WEEKEND' });
    expect(vocabulary().get('sabados')).toEqual({ t: 'WD', v: 6, plural: true });
  });

  it('does not know a word no language lists', () => {
    expect(vocabulary().get('bebida')).toBeUndefined();
  });

  it('is built once', () => {
    expect(vocabulary()).toBe(vocabulary());
    expect(wordsThatAreNotTypos()).toBe(wordsThatAreNotTypos());
  });

  it('holds every phrase of every language', () => {
    const phrases = new Set(
      Object.values(languages).flatMap(({ words }) => entriesOf(words).map(([phrase]) => phrase)),
    );

    expect([...vocabulary().keys()].sort()).toEqual([...phrases].sort());
  });

  it('keeps the phrases by kind of term, so a month stands before a word about the time', () => {
    const order = [...vocabulary().keys()];

    // "aprol" is one letter away from both: it is read as the first, the month.
    expect(order.indexOf('april')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('april')).toBeLessThan(order.indexOf('aprox'));
  });

  it.each(Object.entries(languages))(
    'writes the phrases of %s in lower case, without accents, with single spaces',
    (_name, { words }) => {
      for (const [phrase] of entriesOf(words)) {
        expect(phrase).not.toBe('');
        expect(phrase).toBe(phrase.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''));
        expect(phrase).toBe(phrase.trim().replace(/\s+/g, ' '));
      }
    },
  );

  it('gives a phrase that several languages list the same term in each', () => {
    const seen = new Map<string, Term>();
    for (const { words } of Object.values(languages)) {
      for (const [phrase, term] of entriesOf(words)) {
        expect(seen.get(phrase) ?? term, phrase).toEqual(term);
        seen.set(phrase, term);
      }
    }
  });

  it('keeps the words of every language that look like a typo and are not', () => {
    expect(wordsThatAreNotTypos().has('vienes')).toBe(true);
    expect(wordsThatAreNotTypos().has('viernes')).toBe(false);
  });
});
