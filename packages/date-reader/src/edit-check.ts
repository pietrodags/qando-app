// The check of an edit: whether a phrase copy-edited by someone else (a language model) still
// says when as the phrase the organizer wrote. An editor may fix how a phrase is written, never
// what it says: an edit that fails the check is discarded and the phrase is read as written.
// The check reads both phrases with the reader's own tokenizer and vocabulary; the words it
// needs beyond them are data of each language (`EditWords`). What it holds an edit to:
// - Numbers: every number of the edit was already in the original, as many times as written
//   there. An edit may drop numbers (a self-correction, a street number), never change or add
//   one. A number in words is the same number in figures ("ocho" = 8, "y media" = 30); "00"
//   minutes and leading zeros add nothing. Only the original is read as a person reads it: a
//   number word with a typo, glued or split is that number.
// - Days and hours: an edit that drops a number used as a day of the month or an hour must
//   still say a day or an hour of its own, as a correction does.
// - Weekdays: kept in the original's order, and none the original does not name; a weekend
//   word said alone is never split into its two days.
// - Months: the only month the original names stays.
// - Negations, weeks and months: a date negation ("menos", "can't", "el viernes no me va")
//   stays, or goes together with the date it rules out; a week or month reference ("la semana
//   que viene") stays, unless every day left has its day number.
// - The half of the day: if the original settles one, the edit still settles one; and the edit
//   settles none the original does not. For that the original is read as a person reads it: a
//   half word with a typo, glued, split or in a short form says its half.
// - Meal words: each keeps a word of the same meaning ("cenita" → "cena").
import { known } from './known.js';
import { nearlyEqual, plain, tokenize, type Token, type TokenType } from './tokenizer.js';
import type { Half } from './reading.js';
import type { Term } from './vocabulary/term.js';
import { editWords, vocabulary } from './vocabulary/vocabulary.js';

/** A value built on first use and kept. */
const once = <T>(build: () => T): (() => T) => {
  let built: { readonly value: T } | undefined;
  return () => (built ??= { value: build() }).value;
};

const isOneOf = (type: TokenType | undefined, types: readonly TokenType[]): boolean =>
  type !== undefined && types.includes(type);

/** The words of a phrase as the vocabulary writes them, figures and signs left out. */
const wordsOf = (text: string): string[] => plain(text).match(/[a-z]+/g) ?? [];

/** The number a term says: a number said in full or an ordinal that counts from the start. */
const numberOf = (term: Term | undefined): number | undefined => {
  if (term?.t === 'NUM' && !term.weak) return term.v;
  if (term?.t === 'ORD' && known(term.v) > 0) return term.v;
  return undefined;
};

const minutes = once(() => new Map(editWords().minutes));
/** The number a word or run of words says, minutes included ("y media"). */
const numberSaid = (phrase: string): number | undefined =>
  minutes().get(phrase) ?? numberOf(vocabulary().get(phrase));

/** The last word of each way of saying minutes ("media"), which alone says no number. */
const minuteWords = once(
  () => new Set([...minutes().keys()].map((phrase) => known(phrase.split(' ').at(-1)))),
);
/** Single words that say a number or minutes, which the original may mistype or glue. */
const numberWords = once(() =>
  [...new Set([...vocabulary().keys(), ...minuteWords()])].filter(
    (word) => !word.includes(' ') && (numberSaid(word) !== undefined || minuteWords().has(word)),
  ),
);
const readAsNumbers = once(() => new Map(editWords().readAsNumbers));

const longestFirst = (a: string, b: string): number => b.length - a.length;

/**
 * The original's words as a person reads them (owner, 2026-11-12): a number word with one typo
 * ("meida", "sies"), glued to another word ("alesvuit", "quarterto"), inside a run of glued
 * words ("alasdiezdelanoche"), split ("veinti cinco") or the Catalan "u" after an article is
 * that number, so the editor's right fix does not look like a new number. A number stands for
 * a word read as one where it stands.
 */
function asPersonReads(words: readonly string[]): (string | number)[] {
  return words.flatMap((word, at): (string | number)[] => {
    const read = readAsNumbers().get(`${words[at - 1] ?? ''} ${word}`) ?? readAsNumbers().get(word);
    if (read !== undefined) return [read];
    if (vocabulary().has(word) || minuteWords().has(word)) return [word];
    if (word.length >= 4) {
      const near = numberWords().filter(
        (number) => number.length >= 4 && nearlyEqual(word, number),
      );
      if (near.length === 1) return near;
    }
    const glued = numberWords()
      .filter((number) => number.length >= 3 && (word.startsWith(number) || word.endsWith(number)))
      .sort(longestFirst)[0];
    if (glued !== undefined) {
      return word.startsWith(glued)
        ? [glued, word.slice(glued.length)]
        : [word.slice(0, -glued.length), glued];
    }
    const inside =
      word.length >= 8
        ? numberWords()
            .filter((number) => number.length >= 4 && word.includes(number))
            .sort(longestFirst)[0]
        : undefined;
    if (inside === undefined) return [word];
    const where = word.indexOf(inside);
    return [word.slice(0, where), inside, word.slice(where + inside.length)];
  });
}

/**
 * The numbers a phrase writes, each with how many times. `asPersonReadsIt`: the phrase is the
 * original, read as a person would (owner, 2026-11-13): besides its typos and glued words,
 * tens split by "y" are one number or two ("diez y ocho" is 18, and also 10 and 8).
 */
function numbersOf(text: string, asPersonReadsIt = false): Map<number, number> {
  // the "2" of "2nite" is part of a word of the vocabulary, no number
  const found = [...plain(text).matchAll(/(\d+)[a-z]*/g)]
    .filter(([figure]) => !vocabulary().has(figure))
    .map(([, digits]) => Number(digits));
  const words = asPersonReadsIt ? asPersonReads(wordsOf(text)) : wordsOf(text);
  /** Numbers in words, each with the place of the word after it, so "twenty seventh" joins into 27. */
  const spoken: { value: number; end: number; minutes: boolean }[] = [];
  for (let at = 0; at < words.length;) {
    let taken = 1;
    for (let size = Math.min(3, words.length - at); size >= 1; size--) {
      const word = words[at];
      const phrase = words.slice(at, at + size).join(' ');
      const value = size === 1 && typeof word === 'number' ? word : numberSaid(phrase);
      if (value === undefined) continue;
      const tens = spoken.at(-1);
      const before = words[at - 1];
      const joins = (list: readonly string[]) =>
        typeof before === 'string' && list.includes(before);
      // "half seven" is 7:30, never 37
      const units = tens !== undefined && !tens.minutes && value < 10;
      const joined =
        units &&
        tens.value >= 20 &&
        tens.value % 10 === 0 &&
        (tens.end === at || (tens.end === at - 1 && joins(editWords().joinsTens)));
      const splitTen =
        asPersonReadsIt &&
        units &&
        tens.value === 10 &&
        tens.end === at - 1 &&
        joins(editWords().joinsTen);
      if (splitTen) found.push(10 + value);
      if (joined) tens.value += value;
      else spoken.push({ value, end: at + size, minutes: minutes().has(phrase) });
      taken = size;
      break;
    }
    at += taken;
  }
  const counts = new Map<number, number>();
  for (const value of [...found, ...spoken.map((number) => number.value)]) {
    if (value !== 0) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** The meal words a phrase writes, also inside a longer phrase ("después de cenar"). */
const mealWords = (text: string): Term[] =>
  wordsOf(text)
    .map((word) => vocabulary().get(word))
    .filter((term) => term !== undefined)
    .filter((term) => term.t === 'FILLER' && term.half !== undefined);

/** The meanings of the meal words a phrase writes: the half of the day and the hours it is said of. */
const mealsOf = (text: string): Set<string> =>
  new Set(mealWords(text).map((term) => `${String(term.half)}:${String(term.hours ?? '')}`));

/**
 * The months a phrase names as written (1–12): month words, and the month of a date in figures.
 * A month that is also another word counts only with a capital ("we may meet").
 */
function monthsOf(text: string): Set<number> {
  const named = text.split(/[^\p{L}]+/u).flatMap((word) => {
    const term = vocabulary().get(plain(word));
    const month = term?.t === 'MO' && !(term.capital && word === word.toLowerCase());
    return month ? [known(term.v)] : [];
  });
  const inFigures = tokenize(text).flatMap((token) =>
    token.t === 'DMY' ? [known(token.month)] : [],
  );
  return new Set([...named, ...inFigures]);
}

const termsOf = (type: TokenType, shortest: number) =>
  once(() =>
    [...vocabulary()].filter(
      ([key, term]) => term.t === type && !key.includes(' ') && key.length >= shortest,
    ),
  );
const monthWords = termsOf('MO', 1);
const weekdayWords = termsOf('WD', 3);

/**
 * The months the original uses as a month (owner, 2026-11-13): a month word beside a day,
 * "de", "en", "next", a year or a colon ("el 3 de julio", "dic: ls sab 5", "next January"),
 * glued to "d", "de" or "del" ("doct", "dagost"), or a date in figures. A word that only looks
 * like one is none ("jo dic dimarts 23", Catalan for "I say").
 */
function monthsRead(original: string): Set<number> {
  const tokens = tokenize(original);
  const type = (k: number) => tokens[k]?.t;
  const named = new Set<number>();
  tokens.forEach((token, k) => {
    if (token.t === 'DMY') named.add(known(token.month));
    const used =
      isOneOf(type(k - 1), ['DE', 'DEL', 'IN', 'ART', 'NUM', 'ORDSUF', 'NEXT']) ||
      isOneOf(type(k + 1), ['NUM', 'DMY', 'DE', 'DEL', 'NEXTYEAR']) ||
      tokens[k + 1]?.colon === true;
    if (token.t === 'MO' && used) named.add(known(token.v));
  });
  for (const word of wordsOf(original)) {
    for (const [key, term] of monthWords()) {
      if (editWords().gluedBeforeMonth.some((before) => word === before + key)) {
        named.add(known(term.v));
      }
    }
  }
  return named;
}

/**
 * The edit keeps the only month the original names ("dic: ls sab 5, 12 y 19" → "los sábados 5,
 * 12 y 19" is discarded); of two months or more one may go, as a day or a correction may.
 */
function keepsOnlyMonth(original: string, edited: string): boolean {
  const [only, ...others] = monthsRead(original);
  return only === undefined || others.length > 0 || monthsOf(edited).has(only);
}

/** The weekdays a phrase names, in the order it names them (0 = Sunday); "dm", "dc" are named too. */
const weekdaysOf = (text: string): number[] =>
  wordsOf(text).flatMap((word) => {
    const term = vocabulary().get(word);
    return term?.t === 'WD' || term?.t === 'WDABBR' ? [known(term.v)] : [];
  });

/** The letters changed, added, dropped or swapped side by side between two words. */
function typos(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => known(d[i]?.[j]);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      let least = Math.min(
        at(i - 1, j) + 1,
        at(i, j - 1) + 1,
        at(i - 1, j - 1) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        least = Math.min(least, at(i - 2, j - 2) + 1);
      }
      known(d[i])[j] = least;
    }
  }
  return at(a.length, b.length);
}

/** A word is another one, or that one with a typo: a letter apart, two in a long word. */
const nearly = (word: string, other: string): boolean =>
  word.length >= 4 &&
  other.length >= 4 &&
  typos(word, other) <= (word.length >= 5 && other.length >= 6 ? 2 : 1);

/** A word is another one glued to more words, before or after it ("eljueves", "porlatarde"). */
const gluedTo = (word: string, other: string): boolean =>
  word.length > other.length && (word.startsWith(other) || word.endsWith(other));

/** "dmg" in "domingo", "dsbte" in "dissabte": the word's letters, in order, from the weekday's first one. */
function shortFor(word: string, weekday: string): boolean {
  if (!weekday.startsWith(word.charAt(0))) return false;
  let at = 0;
  for (const letter of word) {
    at = weekday.indexOf(letter, at) + 1;
    if (at === 0) return false;
  }
  return true;
}

/**
 * A person reads the weekday in the original without the original naming it outright (owner,
 * 2026-11-12): written with a typo ("dissbate", "wendsday"), glued to another word ("eljueves",
 * "satorsun"), shortened ("dmg") or split ("sá bado"). A weekend word alone names no weekday;
 * with its days said one by one ("el finde que viene, cualquiera de los dos días", "next
 * weekend, either day") it names Saturday and Sunday.
 */
function readsWeekday(original: string, day: number): boolean {
  const words = wordsOf(original);
  const splitInTwo = words.slice(1).map((word, at) => `${known(words[at])}${word}`);
  const names = weekdayWords()
    .filter(([, term]) => known(term.v) === day)
    .map(([key]) => key);
  const written = [...words, ...splitInTwo].some((word) =>
    names.some((key) => {
      const short = word.length >= 3 && !vocabulary().has(word) && shortFor(word, key);
      return nearly(word, key) || gluedTo(word, key) || short;
    }),
  );
  if (written) return true;
  const tokens = tokenize(original);
  return (
    (day === 6 || day === 0) &&
    tokens.some((token) => isOneOf(token.t, ['WEEKEND', 'WEEKENDPL'])) &&
    tokens.some((token) => isOneOf(token.t, ['DAY', 'DAYS', 'EACH']))
  );
}

/**
 * The edit names no weekday the original does not ("dm o dc" → "dilluns o dimecres" is
 * discarded): each weekday of the edit is one the original names, abbreviations included
 * ("dm", "sab"), or one a person reads in it. Only the weekdays the original does not name are
 * looked for letter by letter, and each only among its own names.
 */
function namesNoNewWeekday(original: string, edited: string): boolean {
  const named = new Set(weekdaysOf(original));
  return weekdaysOf(edited).every((day) => named.has(day) || readsWeekday(original, day));
}

/** Whether the tokens beside a number make it an hour ("a les 10", "las 22", "10h", "8pm"). */
const hourAt = (tokens: readonly Token[], k: number): boolean =>
  isOneOf(tokens[k - 1]?.t, ['AT', 'ATFROM']) ||
  isOneOf(tokens[k + 1]?.t, ['H', 'PM', 'AM', 'MIN', 'ABOUT', 'QUARTS']) ||
  tokens[k - 1]?.hours === true;

type Role = 'day' | 'hour';

/**
 * The numbers a phrase uses as a day of the month ("el 26", "divendres 26", "del 13 al 31",
 * "26 de julio", "July 26") or an hour. A number in the noise ("el portal 3", "mesa para 4")
 * is neither. "El primer sábado" counts as a day said, of number 0.
 */
function datedNumbers(text: string): { value: number; role: Role }[] {
  const tokens = tokenize(text);
  const type = (k: number) => tokens[k]?.t;
  const roles = new Map<number, Role | null>();
  const roleAt = (k: number): Role | null => {
    if (type(k) === 'TIME') return 'hour';
    if (type(k) === 'DMY') return 'day';
    if (hourAt(tokens, k) || tokens[k + 1]?.clock === true) return 'hour';
    const day =
      isOneOf(type(k + 1), ['MO', 'ORDSUF']) ||
      (type(k + 1) === 'DE' && type(k + 2) === 'MO') ||
      isOneOf(type(k - 1), [
        'WD',
        'ART',
        'DAY',
        'DEL',
        'AL',
        'FROM',
        'TO',
        'UNTIL',
        'BETWEEN',
        'BEFORE',
        'EXCEPT',
        'MO',
      ]);
    if (day) return 'day';
    // "5, 12 y 19 de diciembre": what the number before it in the list is
    return isOneOf(type(k - 1), ['COMMA', 'AND', 'OR']) ? (roles.get(k - 2) ?? null) : null;
  };
  tokens.forEach((token, k) => {
    const number = (token.t === 'NUM' && !token.weak) || token.t === 'TIME' || token.t === 'DMY';
    if (number) roles.set(k, roleAt(k));
  });
  // "de 18 a 20h": the start of a range is what its end is
  for (const [k, role] of roles) {
    const end = roles.get(k + 2);
    if (!role && end && isOneOf(type(k + 1), ['A', 'AL', 'TO', 'DASH', 'UNTIL'])) {
      roles.set(k, end);
    }
  }
  const found = [...roles].flatMap(([k, role]) => {
    const token = known(tokens[k]);
    const value = token.t === 'TIME' ? token.h : token.t === 'DMY' ? token.day : token.v;
    return role ? [{ value: known(value), role }] : [];
  });
  // "el primer sábado de julio"
  const nth = tokens.some(
    (token, k) => token.t === 'ORD' && isOneOf(type(k + 1), ['WD', 'WEEKEND']),
  );
  return nth ? [...found, { value: 0, role: 'day' }] : found;
}

/**
 * An edit that drops a day of the month or an hour must still say one of that kind (owner,
 * 2026-11-12), as a correction or a restatement does ("el miércoles 17, digo el 18" → "el
 * jueves 18"); one that says none any more is discarded ("el divendres 26 per la nit, o sea el
 * viernes, a les 10" → "el viernes a las 10").
 */
function keepsDatedNumbers(original: string, edited: string): boolean {
  const written = numbersOf(edited);
  const before = datedNumbers(original).filter((number) => number.value !== 0);
  const after = new Set(datedNumbers(edited).map((number) => number.role));
  const times = (value: number) => before.filter((number) => number.value === value).length;
  return before
    .filter(({ value }) => (written.get(value) ?? 0) < times(value))
    .every(({ role }) => after.has(role));
}

/**
 * The weekdays of the edit that the original names too come in the original's order (owner,
 * 2026-11-12): "el sábado o el viernes 26" is not "el viernes 26 o el sábado". The edit may
 * drop some.
 */
function keepsOrder(original: string, edited: string): boolean {
  const before = weekdaysOf(original);
  let at = 0;
  for (const day of weekdaysOf(edited).filter((value) => before.includes(value))) {
    while (at < before.length && before[at] !== day) at++;
    if (at === before.length) return false;
    at++;
  }
  return true;
}

/** Tokens that say a date, right after which "no" denies it ("este finde no puedo", "mañana no"). */
const saysDate = (type: TokenType | undefined): boolean =>
  isOneOf(type, [
    'WD',
    'WEEKEND',
    'WEEKENDPL',
    'WEEK',
    'WEEKS',
    'MONTH',
    'MO',
    'NUM',
    'ORD',
    'DMY',
    'TIME',
    'TODAY',
    'TOMORROW',
    'DAYAFTER',
    'DAY',
    'DAYS',
    'HOLIDAY',
    'VAGUE',
  ]);
/**
 * Words around a date that say no date of their own ("el", "de", "a las", "este", the "rd" of
 * "3rd"), and the ones that join the two ends of a range into one date ("del lunes al viernes",
 * "mon-fri", "between the 3rd and the 7th").
 */
const aroundDate = (type: TokenType | undefined): boolean =>
  isOneOf(type, [
    ...['ART', 'ARTPL', 'DE', 'DEL', 'AT', 'ATFROM', 'THIS', 'ORDSUF'],
    ...['A', 'AL', 'TO', 'DASH', 'UNTIL', 'FROM', 'BETWEEN'],
  ] as const);

/**
 * How a date token is told apart ("WD:5", "N:24", "TOMORROW:"; "3/7" says its day and its month,
 * as the two words of "3 de julio" do), and whether that tells one date apart from another: an
 * hour and a wide word ("el día", "la semana", "por la tarde") do not.
 */
function dateMark(tokens: readonly Token[], k: number): { marks: string[]; apart: boolean } {
  const token = known(tokens[k]);
  switch (token.t) {
    case 'TIME':
      return { marks: [`N:${String(token.h)}`], apart: false };
    case 'DMY':
      return { marks: [`N:${String(token.day)}`, `MO:${String(token.month)}`], apart: true };
    case 'NUM':
      return { marks: [`N:${String(token.v)}`], apart: !hourAt(tokens, k) };
    case 'WEEKEND':
    case 'WEEKENDPL':
      return { marks: ['WEEKEND'], apart: true };
    default:
      return {
        marks: [`${token.t}:${String(token.v ?? token.half ?? '')}`],
        apart: !isOneOf(token.t, ['DAY', 'DAYS', 'WEEK', 'WEEKS', 'MONTH', 'VAGUE']),
      };
  }
}

/** The marks of the date some tokens say: its days, or its hours and wide words when it names no day. */
function dateOf(tokens: readonly Token[], places: readonly number[]): string[] {
  const marks = places.filter((k) => saysDate(tokens[k]?.t)).map((k) => dateMark(tokens, k));
  const days = marks.filter((found) => found.apart);
  return (days.length > 0 ? days : marks).flatMap((found) => found.marks);
}

const cannot = once(() => new RegExp(`\\b(?:${editWords().cannot.join('|')})\\b`, 'g'));

/**
 * The date negations of a phrase, each with the date it rules out (owner, 2026-11-13):
 * "menos", "except", "but not" (the date after it); a "no" or "tampoco" said right after a
 * date ("este finde no puedo", "pasado mañana tampoco": the date before it); "can't" (the
 * dates of its clause). A "no," that corrects the phrase, "no wait", and a "no" said of no
 * date ("si alguien no puede", "xq no el lunes") deny no date.
 */
function negationsOf(text: string): string[][] {
  const tokens = tokenize(text);
  const type = (k: number) => tokens[k]?.t;
  const written = (k: number) => {
    const token = tokens[k];
    return token ? plain(text.slice(token.start, token.end)) : '';
  };
  const before = (k: number) => {
    const run = [];
    for (let j = k - 1; saysDate(type(j)) || aroundDate(type(j)); j--) run.push(j);
    return run;
  };
  const after = (k: number) => {
    const run = [];
    for (
      let j = k + 1;
      saysDate(type(j)) || aroundDate(type(j)) || isOneOf(type(j), ['AND', 'OR']);
      j++
    ) {
      run.push(j);
    }
    return run;
  };
  const found: string[][] = [];
  tokens.forEach((token, k) => {
    const afterDate = saysDate(type(k - 1));
    const corrects = type(k + 1) === 'COMMA' || editWords().correcting.includes(written(k + 1));
    if (token.t === 'EXCEPT') found.push(dateOf(tokens, after(k)));
    else if (token.t === 'NEG' && afterDate && !corrects) found.push(dateOf(tokens, before(k)));
    else if (editWords().nor.includes(written(k)) && afterDate) {
      found.push(dateOf(tokens, before(k)));
    }
  });
  const commas = tokens.flatMap((token, k) => (token.t === 'COMMA' ? [k] : []));
  for (const match of text.toLowerCase().replace(/['’]/g, ' ').matchAll(cannot())) {
    const next = tokens.findIndex((token) => token.start >= match.index);
    const at = next < 0 ? tokens.length : next;
    const from = commas.findLast((k) => k < at) ?? -1;
    const to = commas.find((k) => k >= at) ?? tokens.length;
    found.push(
      dateOf(
        tokens,
        tokens.flatMap((_, k) => (k > from && k < to ? [k] : [])),
      ),
    );
  }
  return found;
}

/** The date marks a phrase says anywhere ("WD:5", "N:24"…), its numbers in words included. */
function datesSaid(text: string): Set<string> {
  const tokens = tokenize(text);
  return new Set([
    ...tokens.flatMap((token, k) => (saysDate(token.t) ? dateMark(tokens, k).marks : [])),
    ...[...numbersOf(text).keys()].map((value) => `N:${String(value)}`),
  ]);
}

/** Whether a phrase says a span that covers any day left out of it ("cualquier día", "todo julio", "every"). */
const saysSpan = (text: string): boolean =>
  tokenize(text).some((token) => isOneOf(token.t, ['ANY', 'EVERY'])) ||
  wordsOf(text).some((word) => editWords().spans.includes(word));

/** Whether a date mark is a month's ("MO:7"). */
const isMonth = (mark: string): boolean => mark.startsWith('MO:');

/**
 * The edit keeps each date negation, or drops it together with the date it rules out (owner,
 * 2026-11-13: "mañana no puedo, … el jueves" → "el jueves"). One whose date stays ("mañana no
 * puedo" → "mañana"), or whose day a span of the edit still covers ("… menos el miércoles" →
 * "cualquier día de la semana que viene"), must stay, and with its own date: one negation of
 * the edit holds every mark of its date the edit still says, or every mark of its date under a
 * span ("el viernes no puedo, el sábado sí" → "el viernes sí, el sábado no puedo" and
 * "cualquier día menos el lunes o el martes" → "cualquier día menos el lunes" are discarded).
 */
function keepsNegations(original: string, edited: string): boolean {
  const said = datesSaid(edited);
  const covered = saysSpan(edited);
  const left = negationsOf(edited);
  return negationsOf(original).every((date) => {
    const stays = covered ? date : date.filter((mark) => said.has(mark));
    // a day is gone with its number or its weekday, though its month stays with another day
    // ("el 3/7 no puedo, el 4/7 sí" → "el 4/7")
    const onlyItsMonth = stays.every(isMonth) && !date.every(isMonth);
    if (date.length > 0 && (stays.length === 0 || onlyItsMonth)) return true;
    return left.some((negation) => stays.every((mark) => negation.includes(mark)));
  });
}

/**
 * The weeks and months a phrase places its days in (owner, 2026-11-13): "esta semana", "la
 * semana que viene", "this week", "el mes que viene", each as the kind and how far it is.
 */
function periodsOf(text: string): Set<string> {
  const tokens = tokenize(text);
  const offset = (token: Token | undefined): number | undefined => {
    switch (token?.t) {
      case 'THIS':
        return 0;
      case 'NEXT':
        return 1;
      case 'PAST':
        return -1;
      case 'AFTERNEXT':
        return 2;
      default:
        return undefined;
    }
  };
  return new Set(
    tokens.flatMap((token, k) => {
      if (!isOneOf(token.t, ['WEEK', 'MONTH'])) return [];
      const twoBefore = tokens[k - 2]?.t === 'THIS' ? tokens[k - 2] : undefined;
      const near = [tokens[k - 1], tokens[k + 1], twoBefore]
        .map(offset)
        .find((found) => found !== undefined);
      return near === undefined ? [] : [`${token.t} ${String(near)}`];
    }),
  );
}

/**
 * Whether every day the phrase says has its day number ("el jueves 2 de julio, el viernes 10",
 * "Thursday the 2nd"), and it says one at least: a week word can no longer frame them (owner,
 * 2026-11-13). A weekend, "entre semana", "cualquier día" and "todos" have no number.
 */
function daysAllNumbered(text: string): boolean {
  const tokens = tokenize(text);
  const type = (k: number) => tokens[k]?.t;
  const day = (k: number) => {
    const token = tokens[k];
    return (token?.t === 'NUM' && !token.weak) || token?.t === 'DMY';
  };
  const numbered = (k: number) =>
    day(k + 1) || day(k - 1) || (isOneOf(type(k + 1), ['ART', 'COMMA', 'MO']) && day(k + 2));
  if (!datedNumbers(text).some(({ value, role }) => role === 'day' && value !== 0)) return false;
  return tokens.every(
    (token, k) =>
      !isOneOf(token.t, ['WEEKEND', 'WEEKENDPL', 'WORKDAYS', 'ANY', 'EVERY', 'DAY', 'DAYS']) &&
      (token.t !== 'WD' || numbered(k)),
  );
}

/**
 * Whether the edit keeps the original's week and month references. A week reference may go
 * when every day left in the edit has its day number ("… el viernes 10 o el jueves 16 … esta
 * semana" → "el viernes 10 o el jueves 16").
 */
function keepsPeriods(original: string, edited: string): boolean {
  const periods = periodsOf(edited);
  const lost = [...periodsOf(original)].filter((period) => !periods.has(period));
  return (
    lost.length === 0 ||
    (lost.every((period) => period.startsWith('WEEK ')) && daysAllNumbered(edited))
  );
}

/** The half of the day a token settles, if any: "8pm", "de la tarde", "tonight", a lunch hour. */
const halfOf = (token: Token): Half | undefined =>
  token.t === 'AM' || token.t === 'PM' ? token.t : (token.half ?? token.meal);

/**
 * The halves of the day a phrase settles: "de la tarde", "por la noche", "8pm", "tonight",
 * "madrugada", "noche de San Juan", a meal word (also inside a longer phrase: "después de
 * cenar").
 */
const halvesOf = (text: string): Set<Half> =>
  new Set(
    [...tokenize(text).map(halfOf), ...mealWords(text).map((term) => term.half)].filter(
      (half) => half !== undefined,
    ),
  );

/**
 * Every word the vocabulary uses, alone or inside a phrase ("media" of "y media"): none of them
 * is a typo of a half word.
 */
const vocabularyWords = once(
  () => new Set([...vocabulary().keys()].flatMap((phrase) => phrase.split(' '))),
);

/**
 * How many times a phrase says a half word, or a short form of it, outside what settles that
 * half: "mañana" as tomorrow, the "eve" of "Christmas Eve".
 */
const saidOtherwise = (text: string, half: Half, forms: readonly string[]): number =>
  tokenize(text)
    .filter((token) => halfOf(token) !== half)
    .flatMap((token) => wordsOf(text.slice(token.start, token.end)))
    .filter((word) => forms.includes(word)).length;

/**
 * A person reads the half of the day in the original without the tokenizer finding it (owner,
 * 2026-11-15): once a number glued to it is taken apart ("sixpm"), in a half word or a short
 * form of it ("dissabte matí", "mñn", "noxe", "eve"), in a word that looks like one and the
 * vocabulary does not use ("mañna", "porlatarde"; "media" is half past, no "migdia"), or in
 * two words that join into one ("medio dia"). Two limits on those words:
 * - A word the vocabulary reads alone as something else is that: "mañana" is tomorrow, so the
 *   original must write the half word more times than that.
 * - A word of the original stands for one word of the edit: the "mñn" the edit keeps as
 *   tomorrow is not its morning too ("mñn a las 8" → "mañana a las 8 de la mañana" is
 *   discarded), so the original must write the half word more times than the edit says it
 *   outside that half.
 */
function readsHalf(original: string, edited: string, half: Half): boolean {
  if (halvesOf(numbersApart(original)).has(half)) return true;
  const words = wordsOf(original);
  return halfWordsOf(half).some((forms) => timesRead(words, edited, half, forms) > 0);
}

/** A phrase with every number glued to a word taken apart, as a person reads it ("sixpm"). */
const numbersApart = (text: string): string =>
  text.replace(/\p{L}+/gu, (word) => asPersonReads([plain(word)]).join(' '));

/** The half words of one half of the day, each with its short forms ("noche", "noxe"). */
const halfWordsOf = (half: Half): [string, ...string[]][] =>
  editWords()
    .halfWords.filter(([itsHalf]) => itsHalf === half)
    .map(([, ...forms]) => forms);

/**
 * How many times some words of the original say one half word as a person reads them: the word
 * or a listed short form, a typo of it or the word glued to others (never a word the vocabulary
 * uses, nor one at a place another half word has `taken`), two words that join into it. None
 * when the vocabulary reads each of them as something else ("mañana" is tomorrow), and a word
 * stands for one word of the edit: the times the edit says it as something else are left out.
 */
function timesRead(
  words: readonly string[],
  edited: string,
  half: Half,
  forms: readonly [string, ...string[]],
  taken = new Set<number>(),
): number {
  const [halfWord] = forms;
  const looksLikeIt = (word: string) =>
    !vocabularyWords().has(word) &&
    (nearly(word, halfWord) || (halfWord.length >= 5 && gluedTo(word, halfWord)));
  const lookalikes = words.flatMap((word, at) =>
    !forms.includes(word) && looksLikeIt(word) && !taken.has(at) ? [at] : [],
  );
  lookalikes.forEach((at) => taken.add(at));
  const written =
    words.filter((word) => forms.includes(word)).length +
    lookalikes.length +
    words.slice(1).filter((word, at) => `${known(words[at])}${word}` === halfWord).length;
  const asSomethingElse = words.filter(
    (word) => forms.includes(word) && vocabulary().has(word),
  ).length;
  if (written <= asSomethingElse) return 0;
  return Math.max(0, written - saidOtherwise(edited, half, forms));
}

/** Tokens after which a half of the day is said of no hour before them. */
const startsPart = (type: TokenType): boolean =>
  isOneOf(type, [
    ...['AND', 'OR', 'COMMA', 'WD', 'WDABBR', 'TODAY', 'TOMORROW', 'DAYAFTER'],
    ...['WEEKEND', 'WEEKENDPL', 'HOLIDAY', 'DMY'],
  ] as const);

/**
 * What the edit says a half of the day of: each hour it follows ("a las 8 de la tarde", "8pm":
 * "8") and "" when it stands with no hour ("por la tarde", "tonight"). A meal word is left out:
 * it speaks for every hour of the phrase.
 */
function saidOf(edited: string, half: Half): Set<string> {
  const tokens = tokenize(edited);
  const found = new Set<string>();
  let hour = '';
  tokens.forEach((token, k) => {
    if (startsPart(token.t)) hour = '';
    else if (token.t === 'TIME') hour = String(token.h);
    else if (token.t === 'NUM' && hourAt(tokens, k)) hour = String(token.v);
    if (token.t !== 'FILLER' && (token.t === half || token.half === half)) found.add(hour);
  });
  return found;
}

/**
 * How many times the original settles a half of the day, read as a person reads it: what the
 * tokenizer reads (numbers glued to words taken apart), and the half words it does not, counted
 * outside what it reads ("trde" is read by the rules: one time). A meal word settles it for
 * every hour ("cena el viernes a las 9 o el sábado a las 10").
 */
function timesSettled(original: string, edited: string, half: Half): number {
  const tokens = tokenize(original);
  if (mealWords(original).some((term) => term.half === half)) return Infinity;
  if (tokens.some((token) => token.meal === half)) return Infinity;
  const settles = (token: Token) => token.t === half || token.half === half;
  const outside = wordsOf(
    tokens
      .filter(settles)
      .reduce(
        (text, token) =>
          text.slice(0, token.start) + ' '.repeat(token.end - token.start) + text.slice(token.end),
        original,
      ),
  );
  const taken = new Set<number>();
  const read = halfWordsOf(half).reduce(
    (sum, forms) => sum + timesRead(outside, edited, half, forms, taken),
    0,
  );
  const apart = tokenize(numbersApart(original)).filter(settles).length;
  return Math.max(tokens.filter(settles).length, apart) + read;
}

/**
 * If the original settles a half of the day, the edit still settles one, in any form (owner,
 * 2026-11-13: "noche de san juan … el 23 desde las 10" → "el 23 desde las 10" is discarded). A
 * half said of an excuse or a corrected part may go ("por la mañana, digo por la tarde, … a
 * las 5" → "por la tarde a las 5"). And the edit settles no half the original does not (owner,
 * 2026-11-14: "Friday at 8" → "Friday at 8pm" is discarded, so the reader asks which half),
 * the original read as a person reads it where the tokenizer finds no such half. And it says a
 * half of no more hours than the times the original settles it (owner, 2026-11-15): the same
 * hour may say its half again ("Friday at 7pm or Saturday same time" → "… Saturday at 7pm"),
 * another hour may not take it ("el viernes por la tarde y el sábado a las 8" → "… el sábado
 * a las 8 de la tarde" is discarded).
 */
function keepsHalves(original: string, edited: string): boolean {
  const before = halvesOf(original);
  const after = halvesOf(edited);
  if (before.size > 0 && after.size === 0) return false;
  if (![...after].every((half) => before.has(half) || readsHalf(original, edited, half))) {
    return false;
  }
  return (['AM', 'PM'] as const).every(
    (half) => saidOf(edited, half).size <= timesSettled(original, edited, half),
  );
}

/**
 * The edit writes no number the original did not, counted as many times as written there; "a
 * esa misma hora", "same time" let it write once more each number the original has.
 */
function addsNoNumber(original: string, edited: string): boolean {
  const before = numbersOf(original, true);
  const saidAgain = tokenize(original).filter((token) => token.t === 'SAMEHOUR').length;
  return [...numbersOf(edited)].every(([value, times]) => {
    const written = before.get(value) ?? 0;
    return times <= written + (written > 0 ? saidAgain : 0);
  });
}

/** Every meal word of the original keeps a word of the same meaning ("cenita" → "cena"). */
function keepsMeals(original: string, edited: string): boolean {
  const meals = mealsOf(edited);
  return [...mealsOf(original)].every((meal) => meals.has(meal));
}

/**
 * Whether a copy-edited phrase still says when as the original does. `false` means the edit
 * may read as other dates or times than the phrase the organizer wrote, and must be discarded.
 * It judges how the two phrases are written, never the dates they give: it needs no "today".
 *
 * @param original the phrase as the organizer wrote it.
 * @param edited the same phrase after a copy edit, in the same language.
 */
export function keepsWhen(original: string, edited: string): boolean {
  return (
    keepsOrder(original, edited) &&
    namesNoNewWeekday(original, edited) &&
    keepsDatedNumbers(original, edited) &&
    keepsOnlyMonth(original, edited) &&
    keepsNegations(original, edited) &&
    keepsPeriods(original, edited) &&
    keepsHalves(original, edited) &&
    addsNoNumber(original, edited) &&
    keepsMeals(original, edited)
  );
}
