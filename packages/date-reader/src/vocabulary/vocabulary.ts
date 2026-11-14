// The vocabulary of the date reader: the words of every language merged into the one lookup the
// grammar uses. Every entry maps a phrase (lower case, no accents, words separated by one space)
// to a term the grammar reads. The grammar never names a word: adding a synonym, an abbreviation
// or a language is adding rows to the language files and a case to the evaluation set.
import { ca } from './ca.js';
import { en } from './en.js';
import { es } from './es.js';
import { shared } from './shared.js';
import type { Language, Term } from './term.js';

/**
 * The languages. A phrase listed in more than one means the same in each.
 */
const LANGUAGES: readonly Language[] = [es, en, ca, shared];

let terms: ReadonlyMap<string, Term> | undefined;
let notTypos: ReadonlySet<string> | undefined;

/**
 * Every phrase of the vocabulary with the term it means, built on first use. The phrases are kept
 * by kind of term, the kinds in the order the languages first list them; inside a kind, language
 * by language, each as written. The order matters to a mistyped word one letter away from several
 * words: it is read as the first of them.
 */
export function vocabulary(): ReadonlyMap<string, Term> {
  terms ??= new Map(
    [
      ...Map.groupBy(
        LANGUAGES.flatMap(({ words }) => words),
        ([term]) => term.t,
      ).values(),
    ]
      .flat()
      .flatMap(([term, phrases]) => phrases.split('|').map((phrase) => [phrase, term])),
  );
  return terms;
}

/** Words that look like a typo of a vocabulary word but are not (kept out of the fuzzy match). */
export function wordsThatAreNotTypos(): ReadonlySet<string> {
  notTypos ??= new Set(LANGUAGES.flatMap((language) => language.notTypos));
  return notTypos;
}
