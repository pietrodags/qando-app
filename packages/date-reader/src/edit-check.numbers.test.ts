// The cases of the numbers of an edit: how the number words of the original are read (typos,
// words glued or split, tens and units, minutes) and which numbers the edit may then write.
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

describe('keepsWhen: numbers', () => {
  // Kept first: the check lists its number words once per file, during the first test that reads a mistyped or glued word.
  it('a number or minutes word of the original with a typo, or glued in a run of words, is that number', () => {
    keeps('el jueves a las 7 y meida', 'el jueves a las 7 y media');
    keeps('dissabte a les 7 i mitaj', 'dissabte a les 7 i mitja');
    keeps('hlaf seven on friday', 'half past seven on Friday');
    keeps('el domingo a las nuebe', 'el domingo a las 9');
    keeps('el sabado a las seisdelatarde', 'el sábado a las 6 de la tarde');
    breaks('el jueves a las 7 y meida', 'el jueves a las 7 y cuarto');
    breaks('el domingo a las nuebe', 'el domingo a las 8');
    breaks('el sabado a las seisdelatarde', 'el sábado a las 7 de la tarde');
  });

  it('a word of three letters is too short to be a mistyped number', () => {
    breaks('el sabado a las och', 'el sábado a las 8');
  });

  it('a word the reader knows is never a mistyped number ("night" is not "eight", "pues" is not "dues")', () => {
    breaks('friday night', 'Friday night at 8');
    breaks('pues el sabado por la tarde', 'el sábado a las 2 de la tarde');
  });

  it('a number word glued to a short word before or after it is still that number', () => {
    keeps('el sabado alasdos', 'el sábado a las 2');
    keeps('dissabte a lesnou', 'dissabte a les 9');
    keeps('saturday at sixpm', 'Saturday at 6pm');
    breaks('el sabado alasdos', 'el sábado a las 3');
    breaks('saturday at sixpm', 'Saturday at 7pm');
  });

  it('two number words glued to each other are both read ("twentyfifth" is 25, "halfseven" is 7:30)', () => {
    keeps('friday the twentyfifth', 'Friday the 25th');
    keeps('halfseven tomorrow', 'half past seven tomorrow');
    breaks('friday the twentyfifth', 'Friday the 20th');
  });

  it('a number word inside a run of glued words of eight letters or more is that number, the longest one it holds', () => {
    keeps('eldiezde julio', 'el 10 de julio');
    keeps('eldiecisietede julio', 'el 17 de julio');
    breaks('eldiezde julio', 'el 11 de julio');
    breaks('eldiecisietede julio', 'el 7 de julio');
  });

  it('the words glued around a number inside a run are read too ("alasdiezy media", "ymediadelatarde")', () => {
    keeps('el viernes alasdiezy media', 'el viernes a las diez y media');
    keeps('el viernes a las 5 ymediadelatarde', 'el viernes a las 5 y media de la tarde');
  });

  it('an everyday word that only holds a number word says no number ("estresa" has "tres", "honestly" has "one")', () => {
    breaks('el lunes me estresa, mejor el martes', 'el martes a las 3');
    breaks('honestly saturday works for me', 'Saturday the 1st');
  });

  it('a Catalan "u" right after "el" is 1, whatever comes after it', () => {
    keeps('el u de juliol a les 8', "l'1 de juliol a les 8");
    breaks('el u de juliol a les 8', 'el 2 de juliol a les 8');
  });

  it('"último" and "last" say no number: the edit may write them where the original shortens or skips them', () => {
    keeps('el ult viernes de julio', 'el último viernes de julio');
    keeps('el último viernes o sábado de julio', 'el último viernes o el último sábado de julio');
  });

  it('an edit may write in words a number the original writes in figures, never another one', () => {
    keeps('el viernes a las 8', 'el viernes a las ocho');
    keeps('el 5 y 6 de julio', 'el cinco y seis de julio');
    keeps('el sabado a las 10 y 5', 'el sábado a las diez y cinco');
    breaks('el viernes a las 8', 'el viernes a las nueve');
    breaks('el 5 y 6 de julio', 'el cinco y dieciséis de julio');
  });

  it('only the original is read as a person reads it: a word the edit spells out says no number ("invitados" is not "dos")', () => {
    keeps('estais todos invitaos el sabado a las 9', 'estáis todos invitados el sábado a las 9');
  });

  it('tens and units far apart, or with a word that does not join them in between, are two numbers', () => {
    keeps('twenty past eight on friday', 'Friday at 8:20');
    keeps('el veinte de julio a las ocho', 'el 20 de julio a las 8');
    keeps('el treinta de junio y uno de julio', 'el 30 de junio y el 1 de julio');
    keeps(
      'somos veinte, reservo cuatro mesas el sabado a las 9',
      'somos 20, reservo 4 mesas el sábado a las 9',
    );
    breaks('twenty past eight on friday', 'Friday the 28th');
    breaks('el veinte de julio a las ocho', 'el 28 de julio a las 8');
    breaks('el treinta de junio y uno de julio', 'el 31 de julio');
  });

  it('only units join tens that end in zero: "veinte y diez" is 20:10, "veinte treinta" 20:30, "veintidós y cinco" 22:05', () => {
    keeps('el viernes a las veinte y diez', 'el viernes a las 20:10');
    keeps('el viernes a las veinte treinta', 'el viernes a las 20:30');
    keeps('el viernes a las veintidos y cinco', 'el viernes a las 22:05');
    breaks('el viernes a las veinte y diez', 'el viernes a las 20:30');
    breaks('el viernes a las veintidos y cinco', 'el viernes a las 22:07');
  });

  it('"diez y siete" in the original is 17, and also 10 and 7; other numbers joined by "y", or a ten far from it, add up to none', () => {
    keeps('el sabado a las diez y siete', 'el sábado a las 10:07');
    keeps('el sabado a las diez y siete', 'el sábado a las 17');
    breaks('el cinco y seis de julio', 'el 5 y 16 de julio');
    breaks('el diez de junio y dos de julio', 'el 10 de junio y el 12 de julio');
  });
});
