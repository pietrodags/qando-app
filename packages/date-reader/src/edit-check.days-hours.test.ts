// More cases of the check of an edit: the numbers used as a day of the month or an hour, and the
// week and month references. Each is a phrase as written and the edit judged: kept (`keeps`) or
// discarded (`breaks`).
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

describe('keepsWhen: days, hours and periods', () => {
  it('a number is an hour by the word after it ("20h", "8pm", "9am", "8 y media", "9 o así", "dos quarts de"): an edit that drops it is discarded', () => {
    breaks('cena 20h el viernes 3', 'cena el viernes 3');
    breaks('cena 8pm el viernes 3', 'cena el viernes 3');
    breaks('desayuno 9am el sábado 4', 'desayuno el sábado 4');
    breaks('cena 8 y media el viernes 3', 'cena el viernes 3');
    breaks('cena 9 o así el viernes 3', 'cena el viernes 3');
    breaks('dinner 8ish on friday the 3rd', 'dinner on Friday the 3rd');
    breaks('sopar a dos quarts de deu divendres 3', 'sopar divendres 3');
  });

  it('a number is an hour after "desde las", "after" or a bare "las"; after "los" or "els" it is none', () => {
    breaks('el viernes desde las 8, que antes no llego', 'el viernes');
    breaks('friday after 8', 'Friday');
    breaks('el viernes 3 hasta las 8', 'el viernes 3');
    breaks('el sábado 4 de las 10 en adelante', 'el sábado 4');
    keeps('quedamos los 4 el viernes', 'quedamos el viernes');
    keeps('venim els 5 divendres', 'divendres');
  });

  it('a clock time is an hour and a date in figures a day wherever they stand', () => {
    breaks('cena 20:30 el viernes 3', 'cena el viernes 3');
    breaks('3/7 o 4/8 a las 8', 'a las 8');
  });

  it('"8 in the evening", "10 at night": the half of the day said right after a number makes it an hour', () => {
    breaks('dinner 8 in the evening on friday the 3rd', 'dinner on Friday the 3rd');
    breaks('drinks 10 at night friday the 3rd', 'drinks at night Friday the 3rd');
  });

  it('a number is a day of the month by what follows it: a month, "de" and a month, an ordinal ending', () => {
    breaks('quedamos 3 julio a las 8', 'quedamos en julio a las 8');
    breaks('quedamos 3 de julio a las 8', 'quedamos en julio a las 8');
    breaks('lets meet 3rd or 4th at 8pm', "let's meet at 8pm");
    // "5 de clase", "6 en julio", "6, julio…": no day of the month, the edit may drop it
    keeps('somos 5 de clase, el viernes a las 9', 'el viernes a las 9');
    keeps('seremos 6 en julio, mejor un viernes a las 9', 'en julio, un viernes a las 9');
    keeps(
      'somos 6, julio nos va mejor, cualquier viernes a las 9',
      'en julio, cualquier viernes a las 9',
    );
  });

  it('a number is a day of the month by the word before it ("el", "día", "del", "al", "a partir del", "fins al", "hasta el día", "between", "antes del", "menos", a month)', () => {
    breaks('el 26 a las 8', 'a las 8');
    breaks('el día 3 a las 8', 'a las 8');
    breaks('el finde del 18 por la tarde', 'el finde por la tarde');
    breaks('del lunes al 15 por la tarde', 'desde el lunes por la tarde');
    breaks('a partir del 15 por la tarde', 'por la tarde');
    breaks('qualsevol tarda fins al 15', 'qualsevol tarda');
    breaks('cualquier tarde hasta el día 15', 'cualquier tarde');
    breaks('between 12 and 20, any evening', 'any evening');
    breaks('cualquier tarde antes del 15', 'cualquier tarde');
    breaks('por las tardes menos 15 y viernes', 'por las tardes menos el viernes');
    breaks('drinks July 26 at 8', 'drinks in July at 8');
  });

  it('a number in a list is what the number before it is ("a las 5, 6 o 7": three hours)', () => {
    breaks('el viernes a las 5, 6 o 7', 'el viernes 5');
    breaks('el viernes a las 5 o 6', 'el viernes 5');
    breaks('el sábado a las 10 y 12', 'el sábado 10');
  });

  it('the start of a range is what its end is ("de 18 a 20h", "6 to 8pm", "18-20h", "3 al 5 de julio")', () => {
    breaks('el viernes de 18 a 20h', 'el viernes 20');
    breaks('el viernes de 18 hasta 20h', 'el viernes 20');
    breaks('cena 18-20h el viernes', 'cena el viernes 20');
    breaks('dinner 6 to 8pm friday', 'dinner Friday 8');
    breaks('quedamos 3 al 5 de julio', 'quedamos a las 5 en julio');
    // a day stays a day before "a" or a dash
    breaks('el viernes 3 a mediodía', 'el viernes a mediodía');
    breaks('viernes 3 - 20h', 'viernes 20h');
  });

  it('"el primer sábado", "el primer finde" count as a day said, and drop none themselves', () => {
    keeps(
      'el finde del 7 y 8 de agosto, o sea el primer finde de agosto',
      'el primer finde de agosto',
    );
    breaks('el primer sábado de julio a las 8', 'el primer sábado de julio');
    keeps('el primer sábado, no, mejor el domingo por la tarde', 'el domingo por la tarde');
  });

  it('an edit that keeps every number drops none, even written another way', () => {
    keeps('quedamos el 3 a las 8', '3, a las 8');
    keeps('el 3 a las 8', '3 a las 8');
  });

  it('a week reference is told by how far it is: this, next, past, the one after next', () => {
    breaks('esta semana el martes', 'la semana que viene el martes');
    breaks('el martes de la semana que viene', 'el martes de la semana pasada');
    breaks('el martes de la semana pasada', 'el martes de la semana que viene');
    breaks('como la semana pasada, el martes a las 8', 'el martes a las 8');
    breaks(
      'la semana pasada no pudo ser, el martes a las 8',
      'la semana siguiente a la que viene, el martes a las 8',
    );
    breaks('la semana siguiente a la que viene, el martes', 'el martes');
    breaks('the week after next, tuesday', 'Tuesday');
    keeps('the week after next, tuesday', 'the week after next, Tuesday');
  });

  it('"esta misma semana": "esta" two words before the week still says which', () => {
    breaks('esta misma semana el jueves', 'el jueves');
    breaks('aquesta mateixa setmana dijous', 'dijous');
    keeps('esta misma semana el jueves', 'esta misma semana, el jueves');
  });

  it('a week or month word that says no which is no reference, and may go', () => {
    keeps('a mitad de semana, el miércoles a las 8', 'el miércoles a las 8');
    keeps('a final de mes, el viernes 30', 'el viernes 30');
    keeps('el jueves que viene, semana complicada pero puedo', 'el jueves que viene');
    keeps('jajaja ok', '');
  });

  it('a week reference may go when every weekday left has its day number: before it, after it, after a comma or a month, or in figures', () => {
    keeps('la semana que viene, el viernes 3', 'el viernes 3');
    keeps('esta semana, el jueves 2/7 o el viernes 3/7', 'el jueves 2/7 o el viernes 3/7');
    keeps(
      'esta semana el 10 (viernes) o el 16 (jueves) a las 9',
      'el 10 (viernes) o el 16 (jueves) a las 9',
    );
    keeps(
      'esta semana: jueves, 2 de julio o viernes, 3 de julio',
      'jueves, 2 de julio o viernes, 3 de julio',
    );
    keeps('this week, Thursday July 2 or Friday July 3', 'Thursday July 2 or Friday July 3');
  });

  it('a week reference stays when a day left has no number: a weekday, a weekend, "entre semana", "cualquier", "todas", "el día"', () => {
    breaks('esta semana el jueves 2 o el viernes a las 9', 'el jueves 2 o el viernes a las 9');
    breaks('esta semana el jueves 2 o el viernes, a las 9', 'el jueves 2 o el viernes, a las 9');
    breaks('esta semana a las 8', 'a las 8');
    breaks('esta semana el viernes 10 o el finde', 'el viernes 10 o el finde');
    breaks('this week friday the 10th, otherwise weekends', 'Friday the 10th, otherwise weekends');
    breaks(
      'la semana que viene el lunes 6 o entre semana por la tarde',
      'el lunes 6 o entre semana por la tarde',
    );
    breaks('esta semana el viernes 10 o cualquier tarde', 'el viernes 10 o cualquier tarde');
    breaks('esta semana el viernes 10 y todas las tardes', 'el viernes 10 y todas las tardes');
    breaks('esta semana el día 10', 'el día 10');
    breaks(
      'esta semana el viernes 10 o los días siguientes',
      'el viernes 10 o los días siguientes',
    );
    breaks(
      'aquesta setmana divendres 10 o els dies de després',
      'divendres 10 o els dies de després',
    );
    // "el primer sábado" is a day said, never a day number
    breaks(
      'esta semana imposible, mejor el primer sábado, 4, a las 9',
      'el primer sábado, 4, a las 9',
    );
  });

  it('a month reference stays even when every day left has its day number', () => {
    breaks('el mes que viene, el viernes 3', 'el viernes 3');
    breaks('este mes, la semana que viene, el jueves 16', 'el jueves 16');
  });
});
