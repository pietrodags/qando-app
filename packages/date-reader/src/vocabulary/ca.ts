// The Catalan words of the date reader, as data. Adding a synonym or an abbreviation is adding
// it to a row here and a case to the evaluation set; the grammar never names a word. A word
// Catalan shares with Spanish ("de", "dia", "tres") is listed in both, with the same meaning.
import type { Language } from './term.js';

export const ca: Language = {
  words: [
    // ── weekdays (v: 0 = Sunday … 6 = Saturday) ───────────────────────────────
    [{ t: 'WD', v: 0 }, 'diumenge'],
    [{ t: 'WD', v: 1 }, 'dilluns'],
    [{ t: 'WD', v: 2 }, 'dimarts'],
    [{ t: 'WD', v: 3 }, 'dimecres'],
    [{ t: 'WD', v: 4 }, 'dijous'],
    [{ t: 'WD', v: 5 }, 'divendres'],
    [{ t: 'WD', v: 6 }, 'dissabte'],
    [{ t: 'WD', v: 0, plural: true }, 'diumenges'],
    [{ t: 'WD', v: 6, plural: true }, 'dissabtes'],
    // Two-letter weekdays ("dm o dc", "dg a les 6"): also ordinary letters ("un dj", "DC"), so the
    // grammar takes them as a weekday only where one can stand (the tokenizer; owner, 2026-11-12).
    [{ t: 'WDABBR', v: 0 }, 'dg'],
    // also chat for "del": "dl 7 al 10 d agosto", "el finde dl 10 d oct"
    [{ t: 'WDABBR', v: 1, short: 'DEL' }, 'dl'],
    [{ t: 'WDABBR', v: 2 }, 'dt|dm'],
    [{ t: 'WDABBR', v: 3 }, 'dc'],
    [{ t: 'WDABBR', v: 4 }, 'dj'],
    [{ t: 'WDABBR', v: 5 }, 'dv'],
    [{ t: 'WDABBR', v: 6 }, 'ds'],

    // ── months (v: 1–12) ──────────────────────────────────────────────────────
    [{ t: 'MO', v: 1 }, 'gener'],
    [{ t: 'MO', v: 2 }, 'febrer'],
    [{ t: 'MO', v: 3 }, 'marc'],
    [{ t: 'MO', v: 4 }, 'abril'],
    [{ t: 'MO', v: 5 }, 'maig'],
    [{ t: 'MO', v: 6 }, 'juny'],
    [{ t: 'MO', v: 7 }, 'juliol'],
    [{ t: 'MO', v: 8 }, 'agost'],
    [{ t: 'MO', v: 9 }, 'setembre'],
    [{ t: 'MO', v: 10 }, 'octubre'],
    [{ t: 'MO', v: 11 }, 'novembre'],
    [{ t: 'MO', v: 12 }, 'desembre'],

    // ── numbers ───────────────────────────────────────────────────────────────
    [{ t: 'NUM', v: 2 }, 'dos|dues'],
    [{ t: 'NUM', v: 3 }, 'tres'],
    [{ t: 'NUM', v: 4 }, 'quatre'],
    [{ t: 'NUM', v: 5 }, 'cinc'],
    [{ t: 'NUM', v: 6 }, 'sis'],
    [{ t: 'NUM', v: 7 }, 'set'],
    [{ t: 'NUM', v: 8 }, 'vuit'],
    [{ t: 'NUM', v: 9 }, 'nou'],
    [{ t: 'NUM', v: 10 }, 'deu'],
    [{ t: 'NUM', v: 11 }, 'onze'],
    [{ t: 'NUM', v: 12 }, 'dotze'],
    [{ t: 'NUM', v: 13 }, 'tretze'],
    [{ t: 'NUM', v: 14 }, 'catorze'],
    [{ t: 'NUM', v: 15 }, 'quinze'],
    [{ t: 'NUM', v: 16 }, 'setze'],
    [{ t: 'NUM', v: 17 }, 'disset'],
    [{ t: 'NUM', v: 18 }, 'divuit'],
    [{ t: 'NUM', v: 19 }, 'dinou'],
    [{ t: 'NUM', v: 20 }, 'vint'],
    [{ t: 'NUM', v: 30 }, 'trenta'],
    // "un sopar", "una trobada": a number only where the grammar expects one.
    [{ t: 'NUM', v: 1, weak: true }, 'un|una'],

    // Ordinals (v: -1 = last).
    [{ t: 'ORD', v: 1 }, 'primer|primera'],
    [{ t: 'ORD', v: 2 }, 'segon|segona'],
    [{ t: 'ORD', v: 3 }, 'tercer|tercera'],
    [{ t: 'ORD', v: 4 }, 'quart|quarta'],
    [{ t: 'ORD', v: 5 }, 'cinque|cinquena'],
    [{ t: 'ORD', v: -1 }, 'ultim|ultima|darrer|darrera|darrers'],
    [{ t: 'ORD', v: 1 }, 'primers'],
    [{ t: 'ORD', v: -2 }, 'penultim|penultima'],
    [{ t: 'ORDSUF' }, 'er'],

    // ── grammar words ─────────────────────────────────────────────────────────
    [{ t: 'ART' }, 'el|la|l|en'],
    [{ t: 'ARTPL' }, 'els'],
    // before a number it is an hour, never a day ("de les 22", "i les 12")
    [{ t: 'ARTPL', hours: true }, 'les'],
    [{ t: 'DE' }, 'de'],
    [{ t: 'DEL' }, 'del|de l'],
    [{ t: 'AL' }, 'al|a l'],
    [{ t: 'A' }, 'a'],
    [{ t: 'TO' }, 'fins|fins a|fins al'],
    [{ t: 'FROM' }, 'des de|des del|a partir del|a partir de'],
    [{ t: 'BETWEEN' }, 'entre'],
    [{ t: 'FROMNOW' }, 'd aqui a|d aqui al'],
    [{ t: 'END' }, 'final|finals'],
    // A vague part of a month or a week ("a mitjans de juliol"): never guessed (R23).
    [{ t: 'PART' }, 'principis|mitjans|mitjan'],
    // The occurrence after the coming one (R25).
    [{ t: 'AFTERNEXT' }, 'seguent al que ve|seguent a la que ve'],
    // "Aquest divendres no, el següent": one occurrence rejected for the one after it, not understood by decision.
    [{ t: 'NEG' }, 'no'],
    [{ t: 'AND' }, 'i|ni'],
    // "excepte dijous, i també dissabte": a day added, never one more left out (R16)
    [{ t: 'AND', also: true }, 'tambe|i tambe'],
    // "si no el dimarts" (or else) but "si no plou" (a condition, R27)
    [{ t: 'OR', cond: true }, 'si no'],
    [{ t: 'OR' }, 'o'],
    [{ t: 'EVERY' }, 'cada|tots|totes'],
    [{ t: 'ANY' }, 'qualsevol'],
    [{ t: 'NEXT' }, 'que ve|vinent|vinents|proper|propera|propers|properes'],
    // "el següent dissabte": alone the coming one; after a named weekend, its day of the weekend after (R25; owner, 2026-11-13)
    [{ t: 'NEXT', after: true }, 'seguent|seguents'],
    [{ t: 'THIS' }, 'aquest|aquesta|aquests'],
    [{ t: 'PAST' }, 'passat|passada'],
    [{ t: 'WEEK' }, 'setmana'],
    [{ t: 'WEEKS' }, 'setmanes'],
    [{ t: 'WEEKEND' }, 'finde|cap de setmana'],
    // "tot el cap de setmana": a weekend said whole; after a weekend already named it is that one (R2; owner, 2026-11-13)
    [{ t: 'WEEKEND', whole: true }, 'tot el cap de setmana|tot el finde'],
    // Monday to Friday of the days said: "entre setmana", "feiner" (R9; owner, 2026-11-13)
    [
      { t: 'WORKDAYS' },
      'laborable|laborables|entre setmana|feiner|feiners|dia feiner|dies feiners',
    ],
    // The coming year: "de l'any que ve" (R4; owner, 2026-11-13)
    [{ t: 'NEXTYEAR' }, 'any que ve|l any que ve|el any que ve|any vinent|l any vinent'],
    [{ t: 'WEEKENDPL' }, 'findes|caps de setmana'],
    [{ t: 'MONTH' }, 'mes'],
    [{ t: 'EACHMONTH' }, 'cada mes'],
    [{ t: 'DAY' }, 'dia'],
    [{ t: 'DAYS' }, 'dies'],
    [{ t: 'HALF' }, 'quinzena'],
    [{ t: 'TODAY' }, 'avui'],
    [{ t: 'TOMORROW' }, 'dema'],
    [{ t: 'DAYAFTER' }, 'dema passat|passat dema'],
    [{ t: 'YESTERDAY' }, 'ahir'],
    [{ t: 'BEFORE' }, 'abans de|abans del'],
    [{ t: 'EXCEPT' }, 'excepte|menys'],

    // ── times ─────────────────────────────────────────────────────────────────
    [{ t: 'AT' }, 'a la|a les|cap a les|cap a la'],
    // "a les 11 i escaig": the hour as said (R10)
    [{ t: 'ABOUT' }, 'aprox|aproximadament|i escaig|mes o menys'],
    // "a qualsevol hora": the hour after it (R10; owner, 2026-11-13)
    [{ t: 'ANYTIME' }, 'a qualsevol hora|qualsevol hora'],
    // "a la mateixa hora": the last hour said (R13; owner, 2026-11-13)
    [{ t: 'SAMEHOUR' }, 'a la mateixa hora|a aquesta mateixa hora|mateixa hora'],
    // "sempre a la tarda": the time is each day's (R13; owner, 2026-11-13)
    [{ t: 'EACH' }, 'sempre'],
    // "divendres tots dos": both of the options said (owner, 2026-11-13); "els dos" alone is read in context (the tokenizer)
    [{ t: 'EACH' }, 'tots dos|totes dues|ambdos|ambdues|els dos dies'],
    [{ t: 'NOON' }, 'migdia'],
    // "al migdia": noon alone; beside a bare hour from 1 to 4, a lunch word that settles it ("a la 1 al migdia" = 13:00; R28, owner, 2026-11-13)
    [{ t: 'NOON', lunch: true }, 'al migdia'],
    [{ t: 'MIDNIGHT' }, 'mitjanit|mitja nit'],
    [{ t: 'H' }, 'hora'],
    [{ t: 'MIN', v: 30 }, 'i mitja'],
    // also the end of a list of ordinals ("el segon i quart dissabte")
    [{ t: 'MIN', v: 15, fourth: true }, 'i quart'],
    // Quarters count toward the next hour: "dos quarts de deu" = 9:30; "a quarts de deu" says no exact hour (R9, R28)
    [{ t: 'QUARTS' }, 'quart de|quarts de|quart d|quarts d'],
    // "tot el dia": the whole day, no time (R9)
    [{ t: 'ALLDAY' }, 'tot el dia'],
    [{ t: 'PM' }, 'de la tarda|del vespre'],
    // "les 12 de la nit" is midnight (R29)
    [{ t: 'PM', twelve: 24 }, 'de la nit'],
    [{ t: 'AM' }, 'de la matinada|de matinada'],
    // "les 12 del migdia" is noon, "la 1 del migdia" 13:00
    [{ t: 'PM', twelve: 12 }, 'del migdia'],
    // "les 12 del matí" is noon
    [{ t: 'AM', twelve: 12 }, 'del mati'],
    // Today named by a part of the day: today, with the part reported as vague unless a clock time follows.
    [{ t: 'TODAYPART', half: 'PM' }, 'aquesta tarda|aquesta nit|aquest vespre'],
    [{ t: 'TODAYPART', half: 'AM' }, 'aquest mati'],
    // Vague words that still say the half of the day: with a clock time they settle it (R28) and are not reported.
    [{ t: 'VAGUE', half: 'PM' }, 'al vespre|a la tarda|a la nit|per la tarda|nit|vespre|tarda'],
    [{ t: 'VAGUE', half: 'AM' }, 'al mati|pel mati'],
    // after work settles pm for a bare hour (R28; owner, 2026-11-13)
    [{ t: 'VAGUE', half: 'PM' }, 'despres de la feina|despres de treballar'],
    // Lunch words: alone a vague time (R9); with a bare hour they say afternoon, as "dinar" does (R28)
    [{ t: 'VAGUE', meal: 'PM', hours: [1, 4] }, 'a l hora de dinar'],
    // plural "les matinades": the part of the day (R9; owner, 2026-11-13)
    [{ t: 'VAGUE', half: 'AM' }, 'les matinades|matinades'],

    // ── holidays (fixed date) and movable ones (not understood for now, R17) ──
    [{ t: 'HOLIDAY', month: 12, day: 25 }, 'nadal'],
    [{ t: 'HOLIDAY', month: 12, day: 24 }, 'nit de nadal'],
    [{ t: 'HOLIDAY', month: 12, day: 31 }, 'cap d any|nit de cap d any'],
    [{ t: 'HOLIDAY', month: 1, day: 6 }, 'reis'],
    [{ t: 'HOLIDAY', month: 6, day: 24 }, 'sant joan|st joan'],
    // The eve of Sant Joan is the night of 23 June (owner, 2026-11-13); said "nit de", it also settles pm for a bare hour (R28)
    [
      { t: 'HOLIDAY', month: 6, day: 23 },
      'revetlla de sant joan|la revetlla de sant joan|revetlla de st joan|la revetlla de st joan',
    ],
    [
      { t: 'HOLIDAY', month: 6, day: 23, meal: 'PM' },
      'nit de sant joan|la nit de sant joan|nit de st joan',
    ],
    [{ t: 'HOLIDAY', month: 12, day: 26 }, 'sant esteve'],
    [{ t: 'HOLIDAY', month: 2, day: 14 }, 'sant valenti'],
    [{ t: 'HOLIDAY', month: 4, day: 23 }, 'sant jordi'],
    [{ t: 'HOLIDAY', month: 9, day: 11 }, 'la diada|diada'],
    [{ t: 'HOLIDAY', month: 10, day: 31 }, 'halloween'],
    [{ t: 'HOLIDAY', month: 11, day: 1 }, 'tots sants'],
    // "Sant Joan, que és dimarts 23": the date that follows names the holiday's day (R17)
    [{ t: 'NAMELY' }, 'que es|que sera'],
    // "és a dir dissabte": the day already said, said again (R24; owner, 2026-11-13)
    [{ t: 'NAMELY' }, 'es a dir|o sigui'],
    [{ t: 'MOVABLE' }, 'pont|carnaval|setmana santa|corpus'],

    // A condition that has nothing to do with dates ("si arreglen el cotxe"): ignored up to the next date (R27).
    [{ t: 'COND' }, 'si|sempre que'],

    // ── noise: words around the dates, never reported as not understood ───────
    [{ t: 'FILLER' }, 'per exemple'],
    // a game's name (owner, 2026-11-13)
    [{ t: 'FILLER' }, 'futbol sala'],
    [{ t: 'FILLER' }, 'quedem|amb|per|podem|potser|fem|fer|una trobada|trobada|sisplau|si us plau'],

    // Words that speak of when without saying it: alone they make a phrase *unclear*, not *does not fit* (R30).
    [{ t: 'WHEN' }, 'algun dia|un dia|quan|aviat|mes tard'],
    // A meal word says the half of the day of a bare hour (R28): "sopar a les 9" is 21:00.
    [{ t: 'FILLER', half: 'AM' }, 'esmorzar|esmorzem'],
    [{ t: 'FILLER', half: 'PM' }, 'sopar|sopem'],
    // Lunch and "berenar" words say afternoon only for the hours such a meal can start at (R28).
    [{ t: 'FILLER', half: 'PM', hours: [1, 4] }, 'dinar|dinem'],
    [{ t: 'FILLER', half: 'PM', hours: [4, 8] }, 'berenar|berenem'],
  ],
  notTypos: [],
};
