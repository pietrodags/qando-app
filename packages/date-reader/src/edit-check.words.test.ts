// The words the check of an edit takes from each language file, beyond the reader's own.
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

describe('keepsWhen: the words of each language', () => {
  // One test, and the only one of this file: the lists are put together once, by the first
  // check that needs any of them, so a mutant in one list is only run against that test.
  it('knows the words of the three languages at once, whatever the language of the phrase', () => {
    // minutes said in words
    keeps('a las ocho y cuarto', 'a las 8:15');
    keeps('a les vuit i mitja', 'a les 8:30');
    keeps('at half past eight', 'at 8:30');
    keeps('at quarter past eight', 'at 8:15');
    // the word that joins tens and units
    keeps('el treinta y uno de julio', 'el 31 de julio');
    keeps('el vint-i-cinc de juliol', 'el 25 de juliol');
    keeps('the twenty and fifth of july', 'the 25th of July');
    // the word that splits a ten from its units
    keeps('el diez y ocho de julio', 'el 18 de julio');
    // words read as a number where they stand
    keeps('el veinti cinco de julio', 'el 25 de julio');
    keeps('el u de juliol', "l'1 de juliol");
    keeps('del u al tres de juliol', "de l'1 al 3 de juliol");
    // what is glued before a month
    keeps('el 3 dagost a les 8', "el 3 d'agost a les 8");
    breaks('el 3 dagost a les 8', 'el 3 a les 8');
    breaks('el 3 deagosto a las 8', 'el 3 a las 8');
    breaks('el 3 delagosto a las 8', 'el 3 a las 8');
    // the words after which a "no" corrects the phrase and denies no date
    keeps('el viernes a las 8 no mejor a las 9', 'el viernes a las 9');
    keeps('divendres a les 8 no millor a les 9', 'divendres a les 9');
    keeps('friday at 8 no wait at 9', 'Friday at 9');
    keeps('friday at 8 no actually at 9', 'Friday at 9');
    // "neither" said after a date
    breaks('el sábado no puedo y el domingo tampoco', 'el sábado no puedo y el domingo');
    breaks('dissabte no puc i diumenge tampoc', 'dissabte no puc i diumenge');
    // "cannot"
    breaks("i can't do friday, saturday works", 'Friday or Saturday');
    breaks('i cannot do friday, saturday works', 'Friday or Saturday');
    // the words of a span that covers the day ruled out
    breaks('toda la semana del 6 menos el miércoles', 'toda la semana del 6');
    breaks('tota la setmana del 6 menys dimecres', 'tota la setmana del 6');
    breaks('todo julio menos los lunes', 'todo julio');
    // the words that say a half of the day, read in the original glued, split or with a typo
    keeps('el sábado a las 5 porlatarde', 'el sábado a las 5 por la tarde');
    keeps('el sábado a las 9 delanoche', 'el sábado a las 9 de la noche');
    keeps('el sábado porlamañana a las 10', 'el sábado por la mañana a las 10');
    keeps('el sábado a las 4 de la madrugda', 'el sábado a las 4 de la madrugada');
    keeps('el sábado alas doce del medio dia', 'el sábado a las 12 del mediodía');
    keeps('dissabte mati a les 10', 'dissabte al matí a les 10');
    keeps('dissabte a les 4 de la matiada', 'dissabte a les 4 de la matinada');
    keeps('dissabte a les 5 delatarda', 'dissabte a les 5 de la tarda');
    keeps('dissabte a les 8 delvespre', 'dissabte a les 8 del vespre');
    keeps('dissabte a les 12 del mig dia', 'dissabte a les 12 del migdia');
    keeps('saturday at 10 inthemorning', 'Saturday at 10 in the morning');
    keeps('saturday at 5 intheafternoon', 'Saturday at 5 in the afternoon');
    keeps('saturday at 8 intheevening', 'Saturday at 8 in the evening');
    keeps('saturday at 10 atnight', 'Saturday at 10 at night');
    keeps('drinks tonightat 8', 'drinks tonight at 8');
    // their short forms
    keeps('el sábado x la mñn a las 10', 'el sábado por la mañana a las 10');
    keeps('el sábado a las 9 d la noxe', 'el sábado a las 9 de la noche');
    keeps('sat morn at 10', 'Saturday morning at 10');
    keeps('sat eve at 8', 'Saturday evening at 8');
    // each says its own half only
    breaks('el sábado x la mñn a las 10', 'el sábado por la tarde a las 10');
    breaks('el sábado a las 9 d la noxe', 'el sábado a las 9 de la mañana');
    // the words that say tomorrow or the day after, read in the original glued or with a typo
    keeps('quedamosmañana a las 8', 'quedamos mañana a las 8');
    keeps('pasao mañana a las 9', 'pasado mañana a las 9');
    keeps('todayat 8', 'today at 8');
    keeps('tomorow at 8', 'tomorrow at 8');
    keeps('dema pasat a les 9', 'demà passat a les 9');
    // their short forms
    keeps('mñn a las 8', 'mañana a las 8');
    keeps('tmrw at 8', 'tomorrow at 8');
    keeps('tmr at 8', 'tomorrow at 8');
    // the words that alone say the day after, once tomorrow is said
    keeps('mañana a las 9 y si no pasado', 'mañana a las 9 o pasado mañana');
    keeps('demà a les 9 i si no passat', 'demà a les 9 o demà passat');
    // a word the vocabulary uses inside a phrase is no typo of a half word
    breaks('el viernes a las 8 y media', 'el viernes a las 8 y media de la tarde');
  });
});
