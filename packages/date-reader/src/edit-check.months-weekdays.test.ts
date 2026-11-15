// More cases of the check of an edit: the month the original names, the weekdays a person reads
// in it and the meaning of its meal words. Each is a phrase as written and the edit judged: kept
// (`keeps`) or discarded (`breaks`).
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

describe('keepsWhen: months and weekdays', () => {
  // First test of the file on purpose: the lists of month and weekday words are built once, in it.
  it('a short weekday or a month glued to another word is read; a word that ends in "x" is no Wednesday', () => {
    keeps('elsab 20 x la tarde', 'el sábado 20 por la tarde');
    keeps('satorsun at 11am', 'Saturday or Sunday at 11am');
    breaks('el prox finde a las 8', 'el próximo miércoles a las 8');
    keeps('el 5 dagost a les 8', "el 5 d'agost a les 8");
    breaks('el 5 doct a les 8', 'el 5 a les 8');
  });

  it('a lunch word and an afternoon snack word are different meals', () => {
    breaks('comida el sábado a las 4', 'merienda el sábado a las 4');
    breaks('merienda el sábado a las 5', 'comida el sábado a las 5');
  });

  it('in the edit, "May" is the month only with a capital', () => {
    keeps('may 5th at 8', 'May 5th at 8');
    breaks('May 5th at 8, I may be late', 'the 5th at 8, I may be late');
  });

  it('the month of a date in figures is the month the original names', () => {
    keeps('el 3/7 a las 8', 'el 3 de julio a las 8');
    breaks('el 3/7 a las 8', 'el 3 a las 8');
  });

  it('a month word after "de l\'", "in", "en", a day, an ordinal or "next" is a month', () => {
    breaks("el 3 de l'abril a les 8", 'el 3 a les 8');
    breaks('dinner in august, any friday', 'dinner any Friday');
    breaks('en agosto, cualquier sábado', 'cualquier sábado');
    breaks('el 3 julio a las 8', 'el 3 a las 8');
    breaks('saturday 3rd july at 8', 'Saturday 3rd at 8');
    breaks('next january, any saturday', 'any Saturday');
  });

  it('a month word before a day, "de", "del" or "next year" is a month', () => {
    breaks('july 26 at 8', 'the 26th at 8');
    breaks('julio de 2027, el primer finde', 'el primer finde de 2027');
    breaks('enero del año que viene, cualquier sábado', 'cualquier sábado del año que viene');
    breaks('january next year, any saturday', 'any Saturday next year');
  });

  it('a month word before a date in figures is a month: with the two months, one may go', () => {
    keeps('july 4/5 at 8pm', 'July 4 or 5 at 8pm');
  });

  it('a month word of four letters or more is a month wherever it stands', () => {
    breaks('July', 'August');
    breaks('julio por las tardes', 'agosto por las tardes');
    breaks('probably sept evenings', 'probably evenings');
    keeps('juliol', 'julio');
  });

  it('a shorter month word said alone, between the ends of the phrase, a comma, "o" or "y", is a month', () => {
    breaks('Dec', 'Nov');
    breaks('jul, por la tarde', 'agosto, por la tarde');
    breaks('por la tarde, jul', 'por la tarde, agosto');
    breaks('nov o', 'dic o');
    breaks('y nov', 'y dic');
    keeps('dec', 'December');
  });

  it('a short month word is a month after "de", "del", "in", "en", a day, an ordinal or "next"', () => {
    breaks('el 3 de dic a las 8', 'el 3 a las 8');
    breaks('el 3 del dic a las 8', 'el 3 a las 8');
    breaks('dinner in dec on the 3rd', 'dinner on the 3rd');
    breaks('en dic el 3', 'el 3');
    breaks('3 dic a las 8', 'el 3 a las 8');
    breaks('the 3rd dec at 8', 'the 3rd at 8');
    breaks('next dec on the 3rd', 'on the 3rd');
  });

  it('a short month word is a month before a day, a date in figures, "de", "del", "next year" or a colon', () => {
    breaks('sat dec 3 at 8', 'Saturday 3 at 8');
    breaks('sab dic 3/12 a las 8', 'sábado 3 a las 8');
    breaks('viernes dic de 2027', 'viernes de 2027');
    breaks('viernes dic del 27', 'viernes del 27');
    breaks('viernes dic next year', 'Friday next year');
    breaks('para dic: los sabados 5 y 12', 'para los sábados 5 y 12');
  });

  it('a short month word after a comma and before a weekday is not said alone', () => {
    keeps('jo, dic dimarts 23 a la nit', 'jo, el dimarts 23 a la nit');
  });

  it('a word the reader takes for a month with a typo is no month said alone ("match")', () => {
    keeps('match, sunday at 11am', 'match, Sunday at 11am');
  });

  it('a weekday rightly written is no typo of another ("Monday" is no "Sunday")', () => {
    breaks('Monday at 8', 'Sunday at 8');
    breaks('Tuesday at 8', 'Thursday at 8');
  });

  it('a word that looks like a month before a comma is no month ("jo dic, dimarts")', () => {
    keeps('jo dic, dimarts 23 a la nit', 'el dimarts 23 a la nit');
  });

  it('a weekday with two letters swapped has one typo', () => {
    keeps('el luens a las 8', 'el lunes a las 8');
    keeps('teus or weds next week', 'Tuesday or Wednesday next week');
    keeps('el jeuv a las 9', 'el jueves a las 9');
  });

  it('a long weekday is read with two typos', () => {
    keeps('wendsday at 6pm', 'Wednesday at 6pm');
    keeps('el juebs a las 9', 'el jueves a las 9');
    keeps('mundy or tuesdy at 7', 'Monday or Tuesday at 7');
  });

  it('a word that only has the end of a weekday, or ends like one, names none', () => {
    breaks('dsp de los coles, el jueves a las 5', 'el miércoles o el jueves a las 5');
    breaks('el jueves a las 8, al volver del curro', 'el jueves o el viernes a las 8');
  });

  it('a word two or more typos away from a short weekday names none', () => {
    breaks('next week, tuesday at 8', 'next week, Tuesday or Wednesday at 8');
    breaks('friday from 6, for a couple of hours', 'Thursday or Friday from 6');
    breaks('happy hour on friday at 6', 'happy hour on Thursday or Friday at 6');
    breaks('june 26th at 8', 'Thursday June 26th at 8');
    breaks('come over on saturday at 8', 'come over on Friday or Saturday at 8');
    breaks('el martes desde las 8', 'el martes o el miércoles desde las 8');
    breaks('my birthday is the 26th, dinner at 9', 'Friday the 26th, dinner at 9');
  });

  it('a short word one letter away from a three-letter weekday names none', () => {
    breaks('the 26th at 8', 'Thursday the 26th at 8');
    breaks('full moon party on the 26th', 'Monday the 26th');
  });

  it('two short words side by side are no split weekday ("i 1er" is not "vier")', () => {
    keeps('el 3er dijous i 1er dissabte de cada mes', 'el 3r dijous i 1r dissabte de cada mes');
    breaks(
      'el 3er dijous i 1er dissabte de cada mes',
      'el 3r dijous, divendres i 1r dissabte de cada mes',
    );
  });

  it('two words that together spell a short weekday name none ("it\'s at 8" is no "sat")', () => {
    breaks("it's at 8 on the 3rd", 'Saturday the 3rd at 8');
  });

  it("a word is short for a weekday only from the weekday's first letter, and with three letters or more", () => {
    breaks('clase de arte el lunes a las 6', 'el lunes o el martes a las 6');
    breaks('el 3 d julio a las 8', 'el domingo 3 de julio a las 8');
  });

  it('weekends, or a weekend with "the day" or "one of the days", name Saturday and Sunday', () => {
    keeps('los findes de julio, los dos días', 'los sábados y domingos de julio');
    keeps('weekends in july, either day', 'Saturdays and Sundays in July');
    keeps('next weekend, whichever day suits you', 'Saturday or Sunday next weekend');
    keeps(
      'el finde que viene, el día que os vaya mejor',
      'el sábado o el domingo del finde que viene',
    );
    keeps(
      'el finde que viene, cualquiera de esos días',
      'el sábado o el domingo del finde que viene',
    );
    keeps('this weekend, one of the days', 'Saturday or Sunday this weekend');
  });

  it('a weekend with its days said one by one names no other weekday, and a "day" word without a weekend names none', () => {
    breaks('next weekend, either day', 'Saturday, Sunday or Monday next weekend');
    breaks(
      'el finde que viene, cualquiera de los dos días',
      'el finde que viene o el lunes, cualquiera de los dos días',
    );
    breaks('cualquier día de la semana que viene', 'el sábado de la semana que viene');
    breaks('any day next week', 'Saturday next week');
  });
});
