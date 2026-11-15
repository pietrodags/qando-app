// The shape of the vocabulary: what a phrase means to the grammar, and the words of a language.
import type { Half } from '../reading.js';

/** The kinds of words the grammar reads. */
export type TermType =
  | 'WD'
  | 'WDABBR'
  | 'MO'
  | 'NUM'
  | 'ORD'
  | 'ORDSUF'
  | 'ART'
  | 'ARTPL'
  | 'DE'
  | 'DEL'
  | 'AL'
  | 'A'
  | 'IN'
  | 'TO'
  | 'UNTIL'
  | 'FROM'
  | 'BETWEEN'
  | 'FROMNOW'
  | 'END'
  | 'PART'
  | 'AFTERNEXT'
  | 'NEG'
  | 'NEXTONE'
  | 'AND'
  | 'OR'
  | 'EVERY'
  | 'ANY'
  | 'NEXT'
  | 'THIS'
  | 'PAST'
  | 'WEEK'
  | 'WEEKS'
  | 'WEEKEND'
  | 'WORKDAYS'
  | 'FORTNIGHT'
  | 'NEXTYEAR'
  | 'WEEKENDPL'
  | 'MONTH'
  | 'EACHMONTH'
  | 'DAY'
  | 'DAYS'
  | 'HALF'
  | 'TODAY'
  | 'TOMORROW'
  | 'DAYAFTER'
  | 'YESTERDAY'
  | 'WITHIN'
  | 'BEFORE'
  | 'EXCEPT'
  | 'AT'
  | 'ABOUT'
  | 'ATFROM'
  | 'ANYTIME'
  | 'SAMEHOUR'
  | 'EACH'
  | 'NOON'
  | 'MIDNIGHT'
  | 'H'
  | 'MIN'
  | 'MINBEFORE'
  | 'QUARTS'
  | 'ALLDAY'
  | 'PM'
  | 'AM'
  | 'VAGUE'
  | 'TODAYPART'
  | 'HOLIDAY'
  | 'NAMELY'
  | 'MOVABLE'
  | 'COND'
  | 'FILLER'
  | 'WHEN'
  // a word nothing reads, listed for what it says of the words beside it ("fútbol 7", "5 a side")
  | 'UNK';

/** What a phrase of the vocabulary means to the grammar: its kind and what that kind needs. */
export interface Term {
  readonly t: TermType;
  /**
   * The value: a weekday (0 = Sunday … 6 = Saturday), a month (1–12), a number, an ordinal
   * (-1 = last, -2 = the one before) or the minutes a word adds to an hour.
   */
  readonly v?: number;
  /** A weekday said in the plural ("sábados"). */
  readonly plural?: true;
  /** A two-letter weekday that is also chat for another word ("dl" = "del"). */
  readonly short?: 'DEL';
  /** A number that is the tens of an ordinal said after it ("twenty-first"). */
  readonly tens?: true;
  /** A number only where the grammar expects one ("un", "una", "an"). */
  readonly weak?: true;
  /**
   * `true`: an article that before a number says an hour, never a day ("las", "les"); two
   * hours: the bare hours a meal word says the half of the day of, from the first to the last.
   */
  readonly hours?: true | readonly [number, number];
  /** "También": what follows is added to what was said. */
  readonly also?: true;
  /** "Si no": "or else" before a date, a condition elsewhere. */
  readonly cond?: true;
  /** "Siguiente": after a named weekend, its day of the weekend after. */
  readonly after?: true;
  /** A weekend said whole ("todo el fin de semana"). */
  readonly whole?: true;
  /** "Mañana": right after a weekday it is the morning. */
  readonly morning?: true;
  /** "Al mediodía": beside a bare hour from 1 to 4, a lunch word. */
  readonly lunch?: true;
  /** "Y cuarto": also the end of a list of ordinals. */
  readonly fourth?: true;
  /** What "12" means with this word: noon (12) or midnight (24). */
  readonly twelve?: 12 | 24;
  /** A vague time that is also a vague part of a month ("late July"). */
  readonly part?: true;
  /** The half of the day the word says. */
  readonly half?: Half;
  /** A lunch word: the half of the day it says for the bare hours of `hours`. */
  readonly meal?: 'PM';
  /** A half of the day said after the hour ("10 at night"): next to a number, its mark. */
  readonly clock?: true;
  /** A weekday that chat also writes for more ("x"): none before "la tarde" or at the end of a message. */
  readonly chat?: true;
  /** "Dos": after "los", "els", said as an aside, both of the options ("viernes los dos"). */
  readonly both?: true;
  /** A game the number after it belongs to ("fútbol 7"). */
  readonly game?: true;
  /** "Side": after a number and "a", the name of a game ("5 a side"). */
  readonly side?: true;
  /** A word that says what a plan is for ("para el vermut", "for the quiz"). */
  readonly purpose?: true;
  /** A month that is also another word ("we may meet"): alone it is the month only with a capital ("May"). */
  readonly capital?: true;
  /** A word that glued to a number from 1 to 5 ends an ordinal ("2do", "4to", "1o"), as an ordinal ending does. */
  readonly ordinal?: true;
  /** The month and the day of a fixed holiday. */
  readonly month?: number;
  readonly day?: number;
}

/**
 * The words the check of an edit reads by itself, beyond the terms of the grammar. All are
 * written as the vocabulary writes a phrase.
 */
export interface EditWords {
  /** Minutes said in words beside an hour, with the number they say ("y media" is 30). */
  readonly minutes: readonly (readonly [string, number])[];
  /** The word that joins the tens and the units of one number ("treinta y uno"). */
  readonly joinsTens: readonly string[];
  /** The word that after a ten makes one number or two ("diez y ocho" is 18, or 10 and 8). */
  readonly joinsTen: readonly string[];
  /**
   * What a person reads as a number where it stands. One word: the start of a number written
   * apart ("veinti cinco"). Two words: the second is that number only after the first ("el u").
   */
  readonly readAsNumbers: readonly (readonly [string, number])[];
  /** What chat glues before a month ("doct", "dagost"). */
  readonly gluedBeforeMonth: readonly string[];
  /** Words that after a "no" correct the phrase and deny no date ("no, perdón", "no wait"). */
  readonly correcting: readonly string[];
  /** Words that after a date deny it as "no" does ("pasado mañana tampoco"). */
  readonly nor: readonly string[];
  /** Ways of saying one cannot, which deny the dates of their clause ("can't"). */
  readonly cannot: readonly string[];
  /** Words that say a span covering any day left out of it ("todo julio"). */
  readonly spans: readonly string[];
  /**
   * The words that say a half of the day, each with its half and then the short ways chat
   * writes it (["AM", "manana", "mnn"]: "mñn"). Short forms are listed, never worked out.
   */
  readonly halfWords: readonly (readonly [Half, string, ...string[]])[];
}

/** The words of one language, as data. */
export interface Language {
  /**
   * One row per meaning: the term and the phrases that mean it, separated by `|`. A phrase is
   * written in lower case, without accents, its words separated by one space.
   */
  readonly words: readonly (readonly [Term, string])[];
  /** Words that look like a typo of a vocabulary word but are not (kept out of the fuzzy match). */
  readonly notTypos: readonly string[];
  /** The short forms of chat, each with the word it is read as ("xa" = "para"). */
  readonly shorthand: readonly (readonly [string, string])[];
  /** The words of the check of an edit this language has. */
  readonly edits: Partial<EditWords>;
}
