// More cases of the check of an edit: the order of the weekdays and the date negations ("menos",
// "except", a "no" right after a date, "can't"), each a phrase as written and the edit judged.
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

describe('keepsWhen: order and negations', () => {
  // Kept first in the file: the words of "can't" are built once, in the first test that reads a phrase.
  it('"can\'t" rules out the dates of its clause, from comma to comma; a phrase without it rules out none', () => {
    keeps('holaa gente!! quedamos el sábado a las 8, porfa confirmad', 'el sábado a las 8');
    breaks("Friday I can't, Saturday at 8", 'Friday or Saturday at 8');
    keeps("Friday I can't, Saturday at 8", 'Saturday at 8');
    keeps("Saturday at 8, Sunday I can't", 'Saturday at 8');
    keeps("Can't do Friday, Saturday at 8", 'Saturday at 8');
    keeps('we cannot do Friday, Saturday at 8', 'Saturday at 8');
    keeps("Saturday at 8, Sunday we won't be around", 'Saturday at 8');
    breaks("Saturday at 8, Sunday we won't be around", 'Saturday or Sunday at 8');
    // without commas the whole phrase is its clause
    breaks("I can't on Friday so Saturday at 8", 'Friday or Saturday at 8');
    // the clause is found where "can't" stands, whatever apostrophes come before it
    keeps("It's Sam's birthday on Friday, can't do Saturday", "Sam's birthday on Friday");
  });

  it('a "no" right after a date denies it, whatever kind of date it is', () => {
    breaks('los findes no puedo, entre semana sí', 'los findes o entre semana');
    breaks('esta semana no puedo, la que viene sí', 'esta semana o la que viene');
    breaks('estas semanas no puedo, en julio sí', 'estas semanas o en julio');
    breaks('este mes no puedo, el que viene sí', 'este mes');
    breaks('este mes no puedo, en julio sí', 'este mes o en julio');
    breaks('en julio no puedo, en agosto sí', 'en julio o en agosto');
    breaks('el primero no puedo, el segundo sí', 'el primero o el segundo');
    breaks('el 3/7 no puedo, el 4/7 sí', 'el 3/7 o el 4/7');
    breaks('a las 20:30 no puedo, a las 21:30 sí', 'a las 20:30 o a las 21:30');
    breaks('hoy no puedo, mañana a las 8', 'hoy o mañana a las 8');
    breaks('avui no puc, demà a les 8', 'avui o demà a les 8');
    breaks('today no good, tomorrow at 8', 'today or tomorrow at 8');
    breaks('ese día no puedo, el sábado sí', 'ese día o el sábado');
    breaks('esos días no puedo, el finde sí', 'esos días o el finde');
    breaks('en navidad no puedo, en reyes sí', 'en navidad o en reyes');
    breaks('por la mañana no puedo, por la tarde sí', 'por la mañana o por la tarde');
  });

  it('a negation rules out the day it names: its hour, its part of the day or its week may stay with another day', () => {
    keeps('el viernes por la tarde no puedo, el sábado por la tarde sí', 'el sábado por la tarde');
    keeps('el viernes a las 8 no puedo, el sábado a las 8 sí', 'el sábado a las 8');
    keeps('el viernes a las 20:30 no puedo, el sábado a las 20:30 sí', 'el sábado a las 20:30');
    keeps('el 3/7 por la tarde no puedo, el 4/7 por la tarde sí', 'el 4/7 por la tarde');
    keeps('el finde por la tarde no puedo, el lunes por la tarde sí', 'el lunes por la tarde');
    keeps('el día 2 o el día 4, el día 3 no puedo', 'el día 2 o el día 4');
    keeps('puedo los días 10 y 11, pero no los días 3 y 4', 'los días 10 y 11');
    keeps(
      'el martes de esta semana no puedo, el jueves de esta semana sí',
      'el jueves de esta semana',
    );
    keeps('los martes de estas semanas no puedo, los jueves sí', 'los jueves de estas semanas');
    keeps('el día 3 de este mes no puedo, el 10 sí', 'el 10 de este mes');
  });

  it('a negation that names no day rules out its hour or its part of the day', () => {
    keeps('por la tarde no puedo, por la mañana a las 10', 'por la mañana a las 10');
    keeps('a las 20:30 no puedo, mejor a las 21:30', 'a las 21:30');
    breaks('a las 20:00 no puedo, a las 21:00 sí', 'a las 20 o a las 21');
    breaks('a las 8 no puedo, a las 9 sí', 'a las 8:00 o a las 9:00');
  });

  it('the date ruled out is the same date however the edit writes it', () => {
    breaks('el 3/7 no puedo, el 4/7 sí', 'el 3 de julio o el 4 de julio');
    breaks('el 1 no puedo, el 2 sí', 'el primero o el 2');
    breaks('el 25 no puc, el 26 sí', 'el vint-i-cinc o el vint-i-sis');
    breaks(
      'findes no puedo, mejor entre semana x la tarde',
      'los fines de semana o entre semana por la tarde',
    );
    breaks(
      'los findes no puedo, entre semana por la tarde',
      'el fin de semana o entre semana por la tarde',
    );
  });

  it('"menos", "excepto", "except" rule out every date joined after them', () => {
    breaks('la semana que viene menos el lunes y el martes', 'el martes de la semana que viene');
    breaks('la semana que viene excepto lunes o martes', 'el martes de la semana que viene');
    breaks('next week except Monday and Tuesday', 'next week on Tuesday');
  });

  it('the date beside a negation is read through its little words ("los", "de", "del", "a las", "este", "el día")', () => {
    keeps(
      'cualquier día menos los findes, o sea de lunes a viernes a las 7',
      'de lunes a viernes a las 7',
    );
    keeps(
      'la semana que viene menos de lunes a miércoles, o sea el jueves o el viernes',
      'el jueves o el viernes de la semana que viene',
    );
    keeps(
      'en agosto menos del 10 al 15 que estoy fuera, por ejemplo el sábado 22',
      'el sábado 22 de agosto',
    );
    keeps('el sábado, pero no a las 10 que es muy pronto, mejor a las 12', 'el sábado a las 12');
    keeps(
      'el viernes, pero no a partir de las 10 que no llego, mejor a las 8',
      'el viernes a las 8',
    );
    keeps("Friday, but not after 10, let's say at 8", 'Friday at 8');
    keeps(
      'en julio, menos este finde que no estoy, por ejemplo el sábado 18',
      'el sábado 18 de julio',
    );
    keeps('esta semana menos el día 3, por ejemplo el jueves 4 a las 8', 'el jueves 4 a las 8');
    // "el 3 de julio no": the day before the month is ruled out too, and it stays
    breaks('el 3 de julio no puedo, el 4 de agosto sí', 'el 3 o el 4 de agosto');
  });

  it('a "no" that corrects what was just said ("no,", "no perdón") denies no date', () => {
    keeps('el viernes a las 8 no, a las 9', 'el viernes a las 9');
    keeps('el viernes a las 8 no perdón a las 9', 'el viernes a las 9');
  });

  it('a span left in the edit ("todos", "every", "todo", "whole", "tot") still covers the day ruled out', () => {
    breaks('todos los días menos el miércoles', 'todos los días');
    breaks('every day except Wednesday', 'every day');
    breaks('todo julio menos los findes', 'todo julio');
    breaks('the whole week except Friday', 'the whole week');
    breaks('tot el juliol menys els dissabtes', 'tot el juliol');
  });

  it('a negation whose date cannot be read must stay: nothing tells that what it rules out is gone', () => {
    breaks('el viernes o el sábado, menos el que haya partido', 'el viernes o el sábado');
    breaks("Friday at 8, can't do earlier", 'Friday at 8');
  });
});
