// More cases of the check of an edit: the days counted from today ("hoy", "mañana", "pasado
// mañana") the edit may name. Each is a phrase as written and the edit judged: kept (`keeps`)
// or discarded (`breaks`).
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

describe('keepsWhen: today, tomorrow and the day after', () => {
  it('an edit names no "today", "tomorrow" or "day after tomorrow" the original does not (owner, 2026-11-15)', () => {
    breaks('tomorrow at 8', 'today at 8');
    breaks('hoy a las 8', 'mañana a las 8');
    breaks('mañana a las 8', 'pasado mañana a las 8');
    breaks('pasado mañana a las 8', 'mañana a las 8');
    breaks('avui a les 8', 'demà a les 8');
    breaks('tonight at 8', 'today at 8pm');
    keeps('hoy o mañana a las 8, o pasado mañana', 'hoy, mañana o pasado mañana a las 8');
  });

  it('reads a day word of the original in a listed short form; one not listed is none', () => {
    keeps('mñn a las 8', 'mañana a las 8');
    keeps('tmrw at 8', 'tomorrow at 8');
    keeps('tmr at 8', 'tomorrow at 8');
    breaks('2moro at 8', 'tomorrow at 8');
  });

  it('reads a day word of the original with a typo: one letter apart, two in a long word', () => {
    keeps('tody at 8', 'today at 8');
    keeps('todya at 8', 'today at 8');
    breaks('tdaay at 8', 'today at 8');
    keeps('tomorow at 8', 'tomorrow at 8');
    keeps('tmorow at 8', 'tomorrow at 8');
    breaks('tmoro at 8', 'tomorrow at 8');
    keeps('pasao mañna a las 9', 'pasado mañana a las 9');
  });

  it('a word with a typo is the nearest day word ("pasat" is "passat", not "pasado")', () => {
    keeps('dema pasat a les 9', 'demà passat a les 9');
  });

  it('reads a day word of the original glued to other words, before it or after it', () => {
    keeps('quedamosmañana a las 8', 'quedamos mañana a las 8');
    keeps('pasadomañana a las 9', 'pasado mañana a las 9');
    keeps('todayat 8', 'today at 8');
    keeps('tmrwnight at 9', 'tomorrow night at 9');
    keeps('lunchtmrw at 1pm', 'lunch tomorrow at 1pm');
  });

  it('a word glued to two day words is read as the longer one', () => {
    keeps('todayortomorrow at 8', 'tomorrow at 8');
    breaks('todayortomorrow at 8', 'today at 8');
  });

  it('a word the vocabulary uses is no typo of a day word', () => {
    breaks('mañana como la pasada vez', 'mañana o pasado mañana');
  });

  it('a "pasado" or a "passat" said alone after tomorrow is the day after', () => {
    keeps('mañana a las 9 y si no pasado', 'mañana a las 9 o pasado mañana');
    keeps('mñn o pasado a las 9', 'mañana o pasado mañana a las 9');
    keeps('demà a les 9 i si no passat', 'demà a les 9 o demà passat');
  });

  it('a "pasado" after a date ("el viernes pasado"), or said before tomorrow, is not the day after', () => {
    breaks('mañana a las 9 como el viernes pasado', 'mañana a las 9 o pasado mañana');
    breaks('pasado el viernes, mañana a las 9', 'mañana a las 9 o pasado mañana');
  });
});
