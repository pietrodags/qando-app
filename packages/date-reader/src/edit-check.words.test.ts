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
  });
});
