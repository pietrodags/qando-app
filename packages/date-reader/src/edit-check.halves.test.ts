// The cases of the check of an edit about the half of the day the edit settles: each a phrase as
// written and the edit judged, kept (`keeps`) or discarded (`breaks`).
import { describe, expect, it } from 'vitest';
import { keepsWhen } from './edit-check.js';

const keeps = (original: string, edited: string) => {
  expect(keepsWhen(original, edited), `"${original}" → "${edited}" should pass`).toBe(true);
};
const breaks = (original: string, edited: string) => {
  expect(keepsWhen(original, edited), `"${original}" → "${edited}" should be discarded`).toBe(
    false,
  );
};

describe('keepsWhen: the half of the day the edit settles', () => {
  it('an edit settles no half of the day the original does not (owner, 2026-11-14)', () => {
    breaks('Friday at 8am', 'Friday at 8pm');
    breaks('Friday at 8', 'Friday at 8pm');
    breaks('el viernes a las 8', 'el viernes a las 8 de la tarde');
    breaks('dissabte a les 10 del matí', 'dissabte a les 10 del vespre');
    breaks('el sábado por la mañana a las 10', 'el sábado por la mañana a las 10 o por la tarde');
    // "en la tarde", "en la mañana" are "por la tarde", "por la mañana" (owner, 2026-11-15)
    keeps(
      'quedamos en el sábado 20 a las 6 en la tarde o si no en el domingo en la mañana, como os cuadre',
      'el sábado 20 a las 6 de la tarde o el domingo por la mañana',
    );
    // the same half in another form
    keeps('el viernes a las 8 de la tarde', 'el viernes por la tarde a las 8');
    keeps('viernes 8pm', 'el viernes a las 8 de la tarde');
  });

  it('reads a half word of the original written with a typo, as a person does (owner, 2026-11-15)', () => {
    keeps('el sabdo 20 a las 9 de la noxe', 'el sábado 20 a las 9 de la noche');
    keeps(
      'el sabdo 20 por la mañna, a las 10 y meida en el parqe',
      'el sábado 20 por la mañana, a las 10 y media',
    );
    keeps(
      'de 11 de la noxhe a 4 de la madrugda el sabado 1 d agosto',
      'el sábado 1 de agosto de 11 de la noche a 4 de la madrugada',
    );
    keeps(
      'dissbate nit de les 23h fins a les 4 de la matiada',
      'dissabte nit de les 23:00 fins a les 4 de la matinada',
    );
    keeps('el ultimo sabado de julio por la mñana', 'el último sábado de julio por la mañana');
    // two typos only in a long word
    keeps('el sábado de madurgdaa a las 4', 'el sábado de madrugada a las 4');
    breaks('el viernes a las 8 en la trdee', 'el viernes a las 8 de la tarde');
    // a short word is never a typo
    breaks('el viernes a las 8 con Tad', 'el viernes a las 8 de la tarde');
  });

  it('reads a half word of the original in its short form (owner, 2026-11-15)', () => {
    keeps('pasado mñn x la mñn', 'pasado mañana por la mañana');
    keeps('mñn o psado mñn x la mñn', 'mañana o pasado mañana por la mañana');
    keeps(
      'fiesta el sab 27 dsd ls 23 hsta ls 4 d la mñn',
      'fiesta el sábado 27 desde las 23 hasta las 4 de la mañana',
    );
    keeps('drinks tmrw eve?', 'drinks tomorrow evening?');
    keeps(
      'fri-sun 26-28 jun, all day xcept sat morn',
      'Friday to Sunday 26-28 June, all day except Saturday morning',
    );
    // a half word the vocabulary does not read alone
    keeps('dissabte mati a les 10', 'dissabte al matí a les 10');
    // a short form says its own half only
    breaks('drinks tmrw eve at 8', 'drinks tomorrow at 8 in the morning');
  });

  it('reads a half word of the original glued to other words, or split in two (owner, 2026-11-15)', () => {
    keeps('lunes22omartes23porlatarde', 'lunes 22 o martes 23 por la tarde');
    keeps('elsábado27 alasdiezdelanoche', 'el sábado 27 a las diez de la noche');
    keeps('el viernes a las 8 tardeya', 'el viernes a las 8 de la tarde');
    keeps(
      'mañanapor la mañana o pasadomañana a las diez',
      'mañana por la mañana o pasado mañana a las diez',
    );
    keeps(
      'pues el sabado 3 de octubre alas doce del medio dia o sino el sábado diez ala misma hora',
      'el sábado 3 de octubre a las 12 del mediodía o si no el sábado 10 a la misma hora',
    );
    // a number glued to what settles the half
    keeps('saturday at sixpm', 'Saturday at 6pm');
    breaks('saturday at sixam', 'Saturday at 6pm');
    // a short half word is never read inside a longer word: "Matías" is no "matí"
    breaks('el viernes a las 8 con Matías', 'el viernes a las 8 de la mañana');
    // two words are joined only into the half word itself
    breaks('mañana por favor a las 8', 'mañana a las 8 de la mañana');
  });

  it('"mañana" alone is tomorrow, never the morning (owner, 2026-11-15)', () => {
    breaks('mañana a las 8', 'mañana a las 8 de la mañana');
    breaks('el sábado mañana', 'el sábado por la mañana'); // accepted cost: it is read well as written
    // a "mñn" the edit keeps as tomorrow is not its morning too
    breaks('mñn a las 8', 'mañana a las 8 de la mañana');
    breaks('pasado mñn a las 8', 'pasado mañana a las 8 de la mañana');
    keeps('mañana x la mñn a las 8', 'mañana por la mañana a las 8');
    // nor is the "eve" the edit keeps in a holiday its evening
    breaks('Christmas Eve at 8', 'Christmas Eve at 8pm');
  });

  it('a word that only looks like a half word is none (owner, 2026-11-15)', () => {
    // short forms are listed, never worked out: "ver" is not "vespre", nor "Toni" "tonight"
    breaks('quedamos el viernes a las 8 para ver la peli', 'el viernes a las 8 de la tarde');
    breaks('el viernes a las 8 con Toni', 'el viernes a las 8 de la noche');
    // a word the vocabulary uses is what the vocabulary says: "media" is half past, "once" eleven
    breaks('el viernes a las 8 y media', 'el viernes a las 8 y media de la tarde');
    breaks('a las once el viernes', 'el viernes a las once de la noche');
  });

  it('"nite", "tonite" and "2nite" are read as "night" and "tonight" (owner, 2026-11-15)', () => {
    keeps('tonite or tmrw nite? 9ish', 'tonight or tomorrow night? 9ish');
    keeps('2nite 7 or 8, ur call', 'tonight at 7 or 8, your call');
    // the "2" of "2nite" is no number of the phrase
    breaks('2nite 7 or 8', 'tonight at 2, 7 or 8');
    keeps('2nite at 2 or 3', 'tonight at 2 or 3');
  });

  it('an edit says a half of the day of no more hours than the times the original settles it (owner, 2026-11-15)', () => {
    breaks(
      'el viernes por la tarde y el sábado a las 8',
      'el viernes por la tarde y el sábado a las 8 de la tarde',
    );
    breaks('Friday afternoon or Saturday at 8', 'Friday afternoon or Saturday at 8pm');
    breaks(
      'el viernes a las 7 de la tarde y el sábado a las 8',
      'el viernes a las 7 de la tarde y el sábado a las 8 de la tarde',
    );
    breaks(
      'esta noche a las 8 o mañana a las 9',
      'esta noche a las 8 o mañana a las 9 de la noche',
    );
    breaks('a las 5 o a las 6 de la tarde', 'a las 5 de la tarde o a las 6 de la tarde');
    breaks(
      'el viernes a las 20:30 por la noche o el sábado a las 21:30',
      'el viernes a las 20:30 de la noche o el sábado a las 21:30 de la noche',
    );
  });

  it('the same hour may say its half again, and a half said twice may go to two hours', () => {
    keeps(
      'mañana a las nueve de la noche y si no pasado a las nueve también',
      'mañana a las 9 de la noche o pasado mañana a las 9 de la noche',
    );
    keeps('Friday at 7pm or Saturday same time', 'Friday at 7pm or Saturday at 7pm');
    keeps(
      'el viernes a las 8 de la tarde y el sábado a las 8',
      'el viernes a las 8 de la tarde y el sábado a las 8 de la tarde',
    );
    keeps(
      'el viernes x la tarde a las 7 o el sabado x la tarde a las 8',
      'el viernes a las 7 de la tarde o el sábado a las 8 de la tarde',
    );
    keeps('el viernes por la tarde a las 8', 'el viernes a las 8 de la tarde');
    keeps('el viernes a las 8 de la tarde noche', 'el viernes a las 8 de la tarde-noche');
  });

  it('an hour said beside its half of the day takes no other half (owner, 2026-11-15)', () => {
    breaks('Friday at 8am or Saturday at 9pm', 'Friday at 8pm or Saturday at 9am');
    breaks(
      'el viernes a las 8 de la mañana o el sábado a las 9 de la noche',
      'el viernes a las 8 de la noche o el sábado a las 9 de la mañana',
    );
  });

  it('each half of the day is held on its own: one hour that takes the other half is enough', () => {
    breaks(
      'Friday at 8am, Saturday at 9pm or Sunday at 10pm',
      'Friday at 8pm, Saturday at 9pm or Sunday at 10',
    );
    breaks(
      'Friday at 8pm, Saturday at 9am or Sunday at 10am',
      'Friday at 8am, Saturday at 9am or Sunday at 10',
    );
  });

  it('an hour may take a half the original says with no hour, and a half may stand with no hour in the edit', () => {
    keeps('a las 8 de la mañana, digo de la tarde', 'a las 8 de la tarde');
    keeps('Friday 8am or Saturday evening at 9', 'Friday 8pm or Saturday at 9');
    keeps('Friday evening or Saturday at 8am', 'Friday evening or Saturday morning at 8');
  });

  it('an hour the original says with both halves keeps both', () => {
    keeps(
      'el vienres a las 8 de la mañana o el sabado a las 8 de la tarde',
      'el viernes a las 8 de la mañana o el sábado a las 8 de la tarde',
    );
  });

  it('an edit that adds only a meal word settles a half the original does not', () => {
    breaks('el viernes a las 9', 'cena el viernes a las 9');
  });

  it('a half said with no hour is one, however many times the edit says it, and a day number is no hour', () => {
    keeps(
      'por la tarde el viernes o el sabado',
      'por la tarde el viernes o por la tarde el sábado',
    );
    keeps('el 26 o el 27 por la tarde', 'el 26 por la tarde o el 27 por la tarde');
    keeps('Friday or Saturday night', 'Friday night or Saturday at night');
  });

  it('a half said after "o", "y" or a comma is said of no hour before them', () => {
    breaks(
      'el viernes a las 8 de la tarde o el sabado',
      'el viernes a las 8 de la tarde o el sábado por la tarde',
    );
    breaks(
      'el viernes a las 8 de la tarde y el sabado',
      'el viernes a las 8 de la tarde y el sábado por la tarde',
    );
    breaks(
      'el viernes a las 8 de la tarde, el sabado',
      'el viernes a las 8 de la tarde, el sábado por la tarde',
    );
  });

  it('a meal word speaks for the hours of its own half only', () => {
    breaks(
      'desayuno el viernes a las 8, y el sabado a las 5 de la tarde o a las 6',
      'desayuno el viernes a las 8, y el sábado a las 5 de la tarde o a las 6 de la tarde',
    );
  });

  it('a feast that settles a half speaks for every hour of the phrase, as a meal word does', () => {
    keeps(
      'la noche de san juan a las 10 o a las 11',
      'la noche de San Juan a las 10 de la noche o a las 11 de la noche',
    );
  });

  it('a word glued that ends like two half words ("seeyoutonight": "tonight", "night") is one time', () => {
    breaks('seeyoutonight at 8 or tomorrow at 9', 'see you tonight at 8 or tomorrow at 9 at night');
    keeps('seeyoutonight at 8 or tomorrow at 9', 'see you tonight at 8 or tomorrow at 9');
  });

  it('a half word the rules do not read is counted beside the ones they read, each once', () => {
    keeps(
      'el lunes noxe a las 7, el martes a las 8pm o el miercoles a las 9 de la trde',
      'el lunes a las 7 de la noche, el martes a las 8pm o el miércoles a las 9 de la tarde',
    );
    breaks(
      'el lunes noxe a las 7, el martes a las 8pm o el miercoles a las 9 de la trde o el jueves a las 10',
      'el lunes a las 7 de la noche, el martes a las 8pm o el miércoles a las 9 de la tarde o el jueves a las 10 de la tarde',
    );
  });

  it('a meal word of the original speaks for every hour of the phrase', () => {
    keeps(
      'cena el viernes a las 9 o el sabado a las 10',
      'cena el viernes a las 9 de la noche o el sábado a las 10 de la noche',
    );
    keeps('lunchtmrw orwednesday,1pm both days', 'lunch tomorrow or Wednesday, 1pm both days');
    keeps(
      'a la hora de comer el viernes a la 1 o el sabado a las 2',
      'a la hora de comer el viernes a la 1 de la tarde o el sábado a las 2 de la tarde',
    );
  });

  it('the times the original settles a half are read as a person reads it: a typo the rules read is one time, one they do not read is one more', () => {
    breaks(
      'el vienres x la trde y el sabado a las 8',
      'el viernes por la tarde y el sábado a las 8 de la tarde',
    );
    keeps('el vienres x la trde a las 8', 'el viernes a las 8 de la tarde');
    keeps(
      'el viernes x la noxe a las 9 o el sabado x la noxe a las 10',
      'el viernes a las 9 de la noche o el sábado a las 10 de la noche',
    );
    breaks(
      'el finde x la noxe, sabado a las 9 o domingo a las 10',
      'el fin de semana por la noche, sábado a las 9 de la noche o domingo a las 10 de la noche',
    );
    keeps('friday sixpm or saturday sevenpm', 'Friday at 6pm or Saturday at 7pm');
  });
});
