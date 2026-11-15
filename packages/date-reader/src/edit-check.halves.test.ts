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
});
