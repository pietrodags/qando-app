// The English words of the date reader, as data. Adding a synonym or an abbreviation is adding
// it to a row here and a case to the evaluation set; the grammar never names a word.
import type { Language } from './term.js';

export const en: Language = {
  words: [
    // ── weekdays (v: 0 = Sunday … 6 = Saturday) ───────────────────────────────
    [{ t: 'WD', v: 0 }, 'sunday|sun'],
    [{ t: 'WD', v: 1 }, 'monday|mon'],
    [{ t: 'WD', v: 2 }, 'tuesday|tue|tues'],
    [{ t: 'WD', v: 3 }, 'wednesday|wed|weds'],
    [{ t: 'WD', v: 4 }, 'thursday|thu|thur|thurs'],
    [{ t: 'WD', v: 5 }, 'friday|fri'],
    [{ t: 'WD', v: 6 }, 'saturday|sat'],
    [{ t: 'WD', v: 0, plural: true }, 'sundays'],
    [{ t: 'WD', v: 1, plural: true }, 'mondays'],
    [{ t: 'WD', v: 2, plural: true }, 'tuesdays'],
    [{ t: 'WD', v: 3, plural: true }, 'wednesdays'],
    [{ t: 'WD', v: 4, plural: true }, 'thursdays'],
    [{ t: 'WD', v: 5, plural: true }, 'fridays'],
    [{ t: 'WD', v: 6, plural: true }, 'saturdays'],

    // ── months (v: 1–12) ──────────────────────────────────────────────────────
    [{ t: 'MO', v: 1 }, 'january|jan'],
    [{ t: 'MO', v: 2 }, 'february|feb'],
    [{ t: 'MO', v: 3 }, 'march'],
    [{ t: 'MO', v: 4 }, 'april|apr'],
    [{ t: 'MO', v: 5 }, 'may'],
    [{ t: 'MO', v: 6 }, 'june|jun'],
    [{ t: 'MO', v: 7 }, 'july|jul'],
    [{ t: 'MO', v: 8 }, 'august|aug'],
    [{ t: 'MO', v: 9 }, 'september|sep|sept'],
    [{ t: 'MO', v: 10 }, 'october|oct'],
    [{ t: 'MO', v: 11 }, 'november|nov'],
    [{ t: 'MO', v: 12 }, 'december|dec'],

    // ── numbers ───────────────────────────────────────────────────────────────
    [{ t: 'NUM', v: 1 }, 'one'],
    [{ t: 'NUM', v: 2 }, 'two'],
    [{ t: 'NUM', v: 3 }, 'three'],
    [{ t: 'NUM', v: 4 }, 'four'],
    [{ t: 'NUM', v: 5 }, 'five'],
    [{ t: 'NUM', v: 6 }, 'six'],
    [{ t: 'NUM', v: 7 }, 'seven'],
    [{ t: 'NUM', v: 8 }, 'eight'],
    [{ t: 'NUM', v: 9 }, 'nine'],
    [{ t: 'NUM', v: 10 }, 'ten'],
    [{ t: 'NUM', v: 11 }, 'eleven'],
    [{ t: 'NUM', v: 12 }, 'twelve'],
    [{ t: 'NUM', v: 13 }, 'thirteen'],
    [{ t: 'NUM', v: 14 }, 'fourteen'],
    [{ t: 'NUM', v: 15 }, 'fifteen'],
    [{ t: 'NUM', v: 16 }, 'sixteen'],
    [{ t: 'NUM', v: 17 }, 'seventeen'],
    [{ t: 'NUM', v: 18 }, 'eighteen'],
    [{ t: 'NUM', v: 19 }, 'nineteen'],
    // "twenty-first": the tens of an ordinal said after them
    [{ t: 'NUM', v: 20, tens: true }, 'twenty'],
    [{ t: 'NUM', v: 30, tens: true }, 'thirty'],
    // "an evening": a number only where the grammar expects one. "A" is not listed: it is the
    // Spanish and Catalan "a" ("de 5 a 7").
    [{ t: 'NUM', v: 1, weak: true }, 'an'],

    // Ordinals (v: -1 = last).
    [{ t: 'ORD', v: 1 }, 'first'],
    [{ t: 'ORD', v: 2 }, 'second'],
    [{ t: 'ORD', v: 3 }, 'third'],
    [{ t: 'ORD', v: 4 }, 'fourth'],
    [{ t: 'ORD', v: 5 }, 'fifth'],
    [{ t: 'ORD', v: 6 }, 'sixth'],
    [{ t: 'ORD', v: 7 }, 'seventh'],
    [{ t: 'ORD', v: 8 }, 'eighth'],
    [{ t: 'ORD', v: 9 }, 'ninth'],
    [{ t: 'ORD', v: 10 }, 'tenth'],
    [{ t: 'ORD', v: 11 }, 'eleventh'],
    [{ t: 'ORD', v: 12 }, 'twelfth'],
    [{ t: 'ORD', v: 13 }, 'thirteenth'],
    [{ t: 'ORD', v: 14 }, 'fourteenth'],
    [{ t: 'ORD', v: 15 }, 'fifteenth'],
    [{ t: 'ORD', v: 16 }, 'sixteenth'],
    [{ t: 'ORD', v: 17 }, 'seventeenth'],
    [{ t: 'ORD', v: 18 }, 'eighteenth'],
    [{ t: 'ORD', v: 19 }, 'nineteenth'],
    [{ t: 'ORD', v: 20 }, 'twentieth'],
    [{ t: 'ORD', v: 30 }, 'thirtieth'],
    [{ t: 'ORD', v: -1 }, 'last'],
    [{ t: 'ORDSUF' }, 'st|nd|rd|th'],

    // ── grammar words ─────────────────────────────────────────────────────────
    [{ t: 'ART' }, 'the|on'],
    [{ t: 'DE' }, 'of'],
    [{ t: 'IN' }, 'in'],
    [{ t: 'TO' }, 'to|till|til|through|thru'],
    [{ t: 'UNTIL' }, 'until'],
    [{ t: 'FROM' }, 'from'],
    [{ t: 'BETWEEN' }, 'between'],
    [{ t: 'FROMNOW' }, 'from now to|from now until|from today to|from today until|between now and'],
    [{ t: 'END' }, 'end|the end'],
    // A vague part of a month or a week ("mid-July"): never guessed (R23).
    [{ t: 'PART' }, 'beginning|the beginning|start|the start|mid|middle|the middle'],
    // The occurrence after the coming one (R25).
    [{ t: 'AFTERNEXT' }, 'after next|after the next|after the coming'],
    // "Not this Friday, the next one": one occurrence rejected for the one after it, not understood by decision.
    [{ t: 'NEG' }, 'no'],
    [{ t: 'NEXTONE' }, 'the one after|one after|the following one|the next one|the one after that'],
    [{ t: 'AND' }, 'and'],
    // "except Thursday, and also Saturday": a day added, never one more left out (R16)
    [{ t: 'AND', also: true }, 'also|as well as|and also'],
    [{ t: 'OR' }, 'or|or else|otherwise|or failing that|failing that|or maybe'],
    [{ t: 'EVERY' }, 'every|each|all'],
    [{ t: 'ANY' }, 'any'],
    [{ t: 'NEXT' }, 'next|coming|upcoming'],
    // "the following Saturday": alone the coming one; after a named weekend, its day of the weekend after (R25; owner, 2026-11-13)
    [{ t: 'NEXT', after: true }, 'following'],
    [{ t: 'THIS' }, 'this'],
    [{ t: 'PAST' }, 'ago'],
    [{ t: 'WEEK' }, 'week'],
    [{ t: 'WEEKS' }, 'weeks'],
    [{ t: 'WEEKEND' }, 'weekend|wknd'],
    // "the whole weekend": a weekend said whole; after a weekend already named it is that one (R2; owner, 2026-11-13)
    [{ t: 'WEEKEND', whole: true }, 'the whole weekend|all weekend|all weekend long'],
    // Monday to Friday of the days said: "weekday" (R9; owner, 2026-11-13)
    [{ t: 'WORKDAYS' }, 'weekday|weekdays|working day|working days'],
    // "a fortnight on Saturday": that weekday two weeks after its coming one (R21; owner, 2026-11-13)
    [{ t: 'FORTNIGHT' }, 'fortnight|a fortnight'],
    // The coming year: "Saturday 9 January next year" (R4; owner, 2026-11-13)
    [{ t: 'NEXTYEAR' }, 'next year'],
    [{ t: 'WEEKENDPL' }, 'weekends'],
    [{ t: 'MONTH' }, 'month'],
    [{ t: 'EACHMONTH' }, 'each month|every month'],
    [{ t: 'DAY' }, 'day'],
    [{ t: 'DAYS' }, 'days'],
    [{ t: 'TODAY' }, 'today'],
    [{ t: 'TOMORROW' }, 'tomorrow|tmrw'],
    [{ t: 'DAYAFTER' }, 'day after tomorrow|the day after tomorrow'],
    [{ t: 'YESTERDAY' }, 'yesterday'],
    [{ t: 'WITHIN' }, 'within'],
    [{ t: 'BEFORE' }, 'before'],
    [{ t: 'EXCEPT' }, 'except|except for|but not|excluding|not'],

    // ── times ─────────────────────────────────────────────────────────────────
    [{ t: 'AT' }, 'at|around|about|at around|at about|like'],
    // "8ish", "11 or so": the hour as said (R10)
    [{ t: 'ABOUT' }, 'ish|or so|approximately|roughly'],
    [{ t: 'ATFROM' }, 'after'],
    // "anytime after 8": the hour after it, as "after 8" (R10; owner, 2026-11-13)
    [{ t: 'ANYTIME' }, 'anytime|any time|at any time'],
    // "same time": the last hour said (R13; owner, 2026-11-13)
    [{ t: 'SAMEHOUR' }, 'same time|the same time|at the same time'],
    // "1pm both days": the time is each day's (R13; owner, 2026-11-13)
    [{ t: 'EACH' }, 'both days|either day|on both days|on either day|both'],
    [{ t: 'NOON' }, 'noon|midday'],
    [{ t: 'MIDNIGHT' }, 'midnight'],
    [{ t: 'H' }, 'hrs|hr|o clock|oclock'],
    // Minutes said before the hour: "half past eight" = 8:30, "quarter to nine" = 8:45 (R28)
    // British "half eight" = 8:30
    [{ t: 'MINBEFORE', v: 30 }, 'half past|half'],
    [{ t: 'MINBEFORE', v: 15 }, 'quarter past|a quarter past'],
    [{ t: 'MINBEFORE', v: -15 }, 'quarter to|a quarter to'],
    // "all day": the whole day, no time (R9)
    [{ t: 'ALLDAY' }, 'all day|all day long|the whole day'],
    // Today named by a part of the day: today, with the part reported as vague unless a clock time follows.
    [{ t: 'TODAYPART', half: 'PM' }, 'tonight|this evening|this afternoon'],
    [{ t: 'TODAYPART', half: 'AM' }, 'this morning'],
    // also a vague part of a month ("late July")
    [{ t: 'VAGUE', part: true }, 'early|late'],
    // The half of the day said after the hour ("10 at night"): next to a number they are its mark, not vague
    [{ t: 'VAGUE', half: 'PM', clock: true }, 'in the evening'],
    [{ t: 'VAGUE', half: 'AM', clock: true, twelve: 12 }, 'in the morning'],
    [{ t: 'VAGUE', half: 'PM', clock: true, twelve: 12 }, 'in the afternoon'],
    [{ t: 'VAGUE', half: 'PM', clock: true, twelve: 24 }, 'at night'],
    // Vague words that still say the half of the day: with a clock time they settle it (R28) and are not reported.
    [{ t: 'VAGUE', half: 'PM' }, 'evening|afternoon'],
    [{ t: 'VAGUE', half: 'AM' }, 'morning'],
    [{ t: 'VAGUE', half: 'PM' }, 'evenings'],
    [{ t: 'VAGUE', half: 'AM' }, 'mornings'],
    [{ t: 'VAGUE', half: 'PM' }, 'afternoons'],
    // after work settles pm for a bare hour (R28; owner, 2026-11-13)
    [{ t: 'VAGUE', half: 'PM' }, 'after work'],
    [{ t: 'VAGUE' }, 'after lunch|after dinner'],
    [{ t: 'VAGUE', half: 'PM' }, 'night|nights'],
    // Lunch words: alone a vague time (R9); with a bare hour they say afternoon, as "lunch" does (R28)
    [
      { t: 'VAGUE', meal: 'PM', hours: [1, 4] },
      'lunchtime|lunch time|around lunchtime|at lunchtime',
    ],

    // ── holidays (fixed date) and movable ones (not understood for now, R17) ──
    [{ t: 'HOLIDAY', month: 12, day: 25 }, 'christmas|christmas day|xmas'],
    [{ t: 'HOLIDAY', month: 12, day: 24 }, 'christmas eve'],
    [{ t: 'HOLIDAY', month: 12, day: 31 }, 'new year s eve|new years eve'],
    [{ t: 'HOLIDAY', month: 1, day: 1 }, 'new year s day|new years day|new year'],
    [{ t: 'HOLIDAY', month: 12, day: 26 }, 'boxing day'],
    [{ t: 'HOLIDAY', month: 2, day: 14 }, 'valentine s day|valentines day'],
    [{ t: 'HOLIDAY', month: 10, day: 31 }, 'halloween'],
    // "Christmas, which is a Friday": the date that follows names the holiday's day (R17)
    [{ t: 'NAMELY' }, 'which is|which will be|that is|that will be'],
    // "i.e. Tuesday": the day already said, said again (R24; owner, 2026-11-13)
    [{ t: 'NAMELY' }, 'i e|namely'],
    [{ t: 'MOVABLE' }, 'easter|good friday|thanksgiving|black friday|easter monday'],

    // A condition that has nothing to do with dates ("if they fix the car"): ignored up to the next date (R27).
    [{ t: 'COND' }, 'if|as long as|provided|unless'],

    // ── noise: words around the dates, never reported as not understood ───────
    [
      { t: 'FILLER' },
      'let s|lets|let|us|meet|meeting|brunch|drinks|how|what|maybe|perhaps|we|could|do|can|please|for|with|would|be|works|work|either|is|are|good|option|options|party|trip|call|sharp|i m|free|available|thinking|say|some|time|it|my|our|guys|hi|hello|hey|thanks',
    ],
    [{ t: 'FILLER' }, 'for example|for instance'],
    // asides (R27)
    [
      { t: 'FILLER' },
      'your call|you decide|up to you|as usual|whichever suits|whichever suits you|whichever works',
    ],

    // Words that speak of when without saying it: alone they make a phrase *unclear*, not *does not fit* (R30).
    [{ t: 'WHEN' }, 'sometime|when|whenever|soon|later|someday'],
    // A meal word says the half of the day of a bare hour (R28): "dinner at 9" is 21:00.
    [{ t: 'FILLER', half: 'AM' }, 'breakfast'],
    [{ t: 'FILLER', half: 'PM' }, 'dinner|supper'],
    // Lunch words say afternoon only for the hours such a meal can start at (R28).
    [{ t: 'FILLER', half: 'PM', hours: [1, 4] }, 'lunch'],
  ],
  notTypos: [],
};
