// The tokenizer: cuts a phrase into the tokens the grammar reads. A token is a figure (a date, a
// clock time, a number), a pause, or a word or run of words of the vocabulary; each keeps its
// place in the phrase. A word of no vocabulary one letter away from one is read as that one.
import { known } from './known.js';
import type { Term, TermType } from './vocabulary/term.js';
import { vocabulary, wordsThatAreNotTypos } from './vocabulary/vocabulary.js';

/**
 * The kinds of token: those of the vocabulary, a date in figures (`DMY`), a clock time in figures
 * (`TIME`), a pause (`COMMA`, `DASH`) and a word nothing reads (`UNK`).
 */
export type TokenType = TermType | 'DMY' | 'TIME' | 'COMMA' | 'DASH' | 'UNK';

/** A token of a phrase: a term, or a figure, with the place (`start`, `end`) it has in the phrase. */
export interface Token extends Omit<Term, 't'> {
  readonly t: TokenType;
  readonly start: number;
  readonly end: number;
  /** Read from a mistyped word. */
  readonly fuzzy?: true;
  /** The hour and the minutes of a clock time in figures. */
  readonly h?: number;
  readonly m?: number;
  /** Figures written with a leading zero ("09:00", "08"). */
  readonly zero?: boolean;
  /** The year of a date in figures, when written. */
  readonly year?: number | undefined;
  /** A pause written as a colon ("dic: los sábados 5, 12 y 19"). */
  readonly colon?: true;
}

const PIECE = /\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}[:.]\d{2}(?!\d)|\d+|[\p{L}]+|[,;:\-–—&+@]/gu;
/** A word as the vocabulary writes it: lower case, no accents. */
export const plain = (word: string): string =>
  word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const SHORTHAND = new Map([
  ['d', 'de'],
  ['q', 'que'],
  ['xa', 'para'],
  ['tb', 'tambien'],
]);
const wordOf = (raw: string): string => {
  const word = plain(raw);
  return SHORTHAND.get(word) ?? word;
};

/** Edit distance of at most one (insert, delete, substitute or swap of neighbours). */
function nearlyEqual(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const rest = (x: number, y: number) => a.slice(i + x) === b.slice(i + y);
  return (
    rest(1, 1) || rest(1, 0) || rest(0, 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && rest(2, 2))
  );
}

let typoTargets: (readonly [string, Term])[] | undefined;
/** The words a typo may be of: one word of five letters or more that is no noise, in the vocabulary's order. */
function wordsToMistype(): readonly (readonly [string, Term])[] {
  typoTargets ??= [...vocabulary()].filter(
    ([key, term]) => key.length >= 5 && !key.includes(' ') && term.t !== 'FILLER',
  );
  return typoTargets;
}
const typoOf = (word: string): Omit<Token, 'start' | 'end'> | null => {
  const term =
    word.length < 4 || wordsThatAreNotTypos().has(word)
      ? null
      : wordsToMistype().find(([key]) => nearlyEqual(word, key))?.[1];
  return term ? { ...term, fuzzy: true } : null;
};

/** Regions whose dates in figures are month/day (R34): the browser's region, e.g. "US" of "en-US". */
const MONTH_FIRST = new Set(['US']);
/** "7/4": day/month, month/day in a month-first region; the other order when one cannot be a date (R34). */
const figures = (a: number, b: number, region: string | undefined) => {
  const monthFirst =
    region !== undefined && MONTH_FIRST.has(region) ? !(a > 12 && b <= 12) : a <= 12 && b > 12;
  return monthFirst ? { day: b, month: a } : { day: a, month: b };
};

/** The years the reader works with: no range of days is longer than the century between them. */
const [FIRST_YEAR, LAST_YEAR] = [2000, 2100];
/** A number written after a date is its year only within those years ("el 20 de julio de 2027", not "de 1999"). */
export const isYear = (year: number): boolean => year >= FIRST_YEAR && year <= LAST_YEAR;
/**
 * The year of a date in figures: one outside those years is read as the nearest of them ("20/7/1999",
 * "31/12/9998"), which is past, or beyond the twelve months, all the same.
 */
const nearYear = (year: number): number => Math.min(Math.max(year, FIRST_YEAR), LAST_YEAR);

const oneOf = (type: TokenType | undefined, ...types: TokenType[]): boolean =>
  type !== undefined && types.includes(type);
/** The value of a token whose kind has one (a weekday, a number, an ordinal). */
const valueOf = (token: Token): number => known(token.v);

/** The tokens of a phrase, in order. `region`: the organizer's browser region ("ES", "US"…), for dates in figures (R34). */
export function tokenize(text: string, region?: string): Token[] {
  const pieces = [...text.matchAll(PIECE)].map((m) => ({
    raw: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
  const tokens: Token[] = [];
  for (let i = 0; i < pieces.length;) {
    const { raw, start, end } = known(pieces[i]);
    const push = (token: Omit<Token, 'start' | 'end'>, last = end) =>
      tokens.push({ ...token, start, end: last });
    if (/^\d/.test(raw)) {
      if (raw.includes('/')) {
        const [a, b, year] = raw.split('/').map(Number);
        push({
          t: 'DMY',
          ...figures(known(a), known(b), region),
          year: year === undefined ? undefined : nearYear(year < 100 ? 2000 + year : year),
        });
      } else if (/[:.]/.test(raw)) {
        const [hours, minutes] = raw.split(/[:.]/).map(Number);
        const [h, m] = [known(hours), known(minutes)];
        if (raw.includes('.') && (h > 24 || m > 59)) push({ t: 'DMY', day: h, month: m });
        else push({ t: 'TIME', h, m, zero: raw.startsWith('0') });
      } else push({ t: 'NUM', v: Number(raw), zero: raw.length > 1 && raw.startsWith('0') });
      i++;
      continue;
    }
    if (/^[,;]$/.test(raw)) {
      push({ t: 'COMMA' });
      i++;
      continue;
    }
    if (raw === ':') {
      push({ t: 'COMMA', colon: true }); // "dic: los sábados 5, 12 y 19" (owner, 2026-11-13)
      i++;
      continue;
    }
    if (/^[-–—]$/.test(raw)) {
      push({ t: 'DASH' });
      i++;
      continue;
    }
    let size = 0;
    for (let n = Math.min(5, pieces.length - i); n >= 1 && !size; n--) {
      const slice = pieces.slice(i, i + n);
      if (slice.some((piece) => /^[\d,;\-–—]/.test(piece.raw))) continue;
      const words = slice.map((piece) => wordOf(piece.raw));
      // a chat "x" before "la tarde", "la noche" is "por" ("el vie x la noche"; owner, 2026-11-13)
      const chat =
        n > 1 && words[0] === 'x'
          ? ['por', 'per']
              .map((word) => vocabulary().get([word, ...words.slice(1)].join(' ')))
              .find((found) => found?.t === 'VAGUE')
          : null;
      const term = chat ?? vocabulary().get(words.join(' '));
      if (term) {
        push(term, known(slice.at(-1)).end);
        size = n;
      }
    }
    if (!size) {
      push(typoOf(wordOf(raw)) ?? { t: 'UNK' });
      size = 1;
    }
    i += size;
  }
  // "twenty-first", "thirty first": the tens and the ordinal after them are one ordinal
  const tens = (n: number) => {
    const token = tokens[n];
    return token?.t === 'NUM' && token.tens === true;
  };
  const units = (n: number) => {
    const token = tokens[n];
    return token?.t === 'ORD' && valueOf(token) >= 1 && valueOf(token) <= 9;
  };
  return chatAndGames(
    text,
    weekdayAbbreviations(
      tokens.flatMap((token, k): Token[] => {
        if (tens(k) && (units(k + 1) || (tokens[k + 1]?.t === 'DASH' && units(k + 2)))) return [];
        if (token.t === 'DASH' && tens(k - 1) && units(k + 1)) return [];
        if (units(k) && (tens(k - 1) || (tokens[k - 1]?.t === 'DASH' && tens(k - 2)))) {
          const first = known(tens(k - 1) ? tokens[k - 1] : tokens[k - 2]);
          return [
            { t: 'ORD', v: valueOf(first) + valueOf(token), start: first.start, end: token.end },
          ];
        }
        return [token];
      }),
    ),
  );
}

/** What may follow "los dos" (both) said as an aside: the end, a pause, a time; never what it counts ("los dos primeros lunes"). */
const ASIDE_AFTER = new Set<TokenType>([
  'END',
  'COMMA',
  'AND',
  'OR',
  'DASH',
  'AT',
  'ATFROM',
  'FROM',
  'VAGUE',
  'NOON',
  'MIDNIGHT',
  'ABOUT',
  'ALLDAY',
  'FILLER',
  'UNK',
]);
/**
 * "a la 1 al migdia", "al mediodía, a las 2": a bare hour from 1 to 4 right beside "al migdia", "al mediodía", which
 * then says its half of the day as a lunch word does; alone it is noon (R10, R28; owner, 2026-11-13).
 */
function lunchHour(tokens: readonly (Token | null)[], k: number, step: number): boolean {
  const type = (n: number) => tokens[n]?.t;
  let at = k;
  if (step > 0) {
    if (type(at) === 'COMMA') at++;
    if (!oneOf(type(at), 'AT', 'ABOUT')) return false;
    at++;
  }
  const token = tokens[at];
  const hour = token?.t === 'NUM' && valueOf(token) >= 1 && valueOf(token) <= 4;
  const dated = oneOf(type(at + 1), 'MO', 'DE', 'DEL', 'PM', 'AM'); // a date, or a half already said
  return hour && (step > 0 ? !dated : oneOf(type(at - 1), 'AT', 'ABOUT'));
}

const GAMES = new Set(['futbol', 'football', 'futbito', 'futsal']);
/**
 * Words that look like dates but are not (owner, 2026-11-13): a chat "x" is "por"/"per" before "la tarde",
 * "la nit" ("aquest dissabte x la tarda") and nothing at the end of a message ("let me know x"), a Wednesday
 * elsewhere ("el x a las 20:00"); a game's number is its name ("5 a side", "5-a-side", "fútbol 7"); "anytime" says
 * something only before "after" or "from" ("anytime after 8").
 */
function chatAndGames(text: string, tokens: (Token | null)[]): Token[] {
  const raw = (k: number) => {
    const token = tokens[k];
    return token ? plain(text.slice(token.start, token.end)) : null;
  };
  const noise = (k: number) => {
    const { start, end } = known(tokens[k]);
    tokens[k] = { t: 'FILLER', start, end };
  };
  tokens.forEach((token, k) => {
    if (!token) return;
    const [next, afterNext] = [tokens[k + 1], tokens[k + 2]];
    if (
      token.t === 'WD' &&
      raw(k) === 'x' &&
      ((next?.t === 'ART' && afterNext?.t === 'VAGUE') || k === tokens.length - 1)
    ) {
      noise(k);
    }
    const hourAfter =
      next?.t === 'ATFROM' ||
      (next?.t === 'FROM' && (oneOf(afterNext?.t, 'NUM', 'TIME') || Boolean(afterNext?.hours)));
    // only "anytime after 8" is read
    if (token.t === 'ANYTIME' && !hourAfter) {
      tokens[k] = { t: 'UNK', start: token.start, end: token.end };
    }
    if (
      token.t === 'NOON' &&
      token.lunch &&
      (lunchHour(tokens, k - 1, -1) || lunchHour(tokens, k + 1, 1))
    ) {
      // "a la 1 al migdia": 13:00 (R28; owner, 2026-11-13)
      tokens[k] = { t: 'VAGUE', meal: 'PM', hours: [1, 4], start: token.start, end: token.end };
    }
    if (token.t !== 'NUM' || token.weak) return;
    const dash = (at: number) => (tokens[at]?.t === 'DASH' ? at + 1 : at);
    const a = dash(k + 1);
    const side = dash(a + 1);
    if (raw(a) === 'a' && raw(side) === 'side') {
      [k, a, side].forEach(noise);
      return;
    }
    const dated = next?.t === 'MO' || (next?.t === 'DE' && afterNext?.t === 'MO');
    if (GAMES.has(raw(k - 1) ?? '') && !dated) noise(k);
    // "el 3 o el 10 de julio, viernes los dos": "los dos", "els dos" (both) is an aside, never day 2 (R24; owner, 2026-11-13)
    const both =
      token.v === 2 &&
      raw(k) === 'dos' &&
      ['los', 'els'].includes(raw(k - 1) ?? '') &&
      ASIDE_AFTER.has(next?.t ?? 'END');
    if (both) {
      tokens[k - 1] = { t: 'EACH', start: known(tokens[k - 1]).start, end: token.end };
      tokens[k] = null;
    }
  });
  return tokens.filter((token) => token !== null);
}

/**
 * "dm o dc", "del dl al dv", "dg a les 6", "dv 26", "dj de la setmana que ve": a Catalan two-letter weekday
 * is one where a weekday can stand, joined to another weekday or followed by its day, time or week; elsewhere
 * it is a word like any other ("música con dj el sábado", "DJ and drinks"). Owner, 2026-11-12.
 */
function weekdayAbbreviations(tokens: readonly Token[]): Token[] {
  const type = (k: number) => tokens[k]?.t;
  const day = (k: number) => oneOf(type(k), 'WD', 'WDABBR');
  const joins = (k: number) => oneOf(type(k), 'OR', 'AND', 'COMMA', 'TO', 'AL', 'A', 'DASH');
  const skipArt = (k: number) => (type(k) === 'ART' ? k + 1 : k);
  const says = (k: number) =>
    oneOf(
      type(k),
      'NUM',
      'TIME',
      'DMY',
      'AT',
      'ATFROM',
      'VAGUE',
      'PM',
      'AM',
      'NEXT',
      'NOON',
      'MIDNIGHT',
      'TOMORROW',
    ) ||
    (type(k) === 'ARTPL' && Boolean(tokens[k]?.hours)) ||
    (oneOf(type(k), 'DE', 'DEL') && oneOf(type(skipArt(k + 1)), 'WEEK', 'THIS', 'NEXT', 'MO'));
  const before = (k: number) =>
    oneOf(type(k), 'EXCEPT', 'EVERY', 'THIS', 'NEXT', 'FROM', 'UNTIL', 'BEFORE');
  return tokens.map((token, k): Token => {
    if (token.t !== 'WDABBR') return token;
    // one that is also chat for another word ("dl" = "del"): that word before a range of days or after a week, a weekend or a day
    const shortFor =
      (type(k + 1) === 'NUM' && oneOf(type(k + 2), 'AL', 'A', 'TO', 'DASH')) ||
      oneOf(type(k - 1), 'WEEK', 'WEEKEND', 'DAY', 'DAYS');
    if (token.short && shortFor) return { t: token.short, start: token.start, end: token.end };
    const weekday =
      (joins(k - 1) && day(k - 2)) ||
      (joins(k + 1) && day(skipArt(k + 2))) ||
      says(k + 1) ||
      before(k - 1);
    return weekday ? { ...token, t: 'WD' } : { t: 'UNK', start: token.start, end: token.end };
  });
}
