// The cases of the check of an edit, each a phrase as written and the edit judged: kept (`keeps`)
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

describe('keepsWhen', () => {
  it('an edit that keeps every number passes', () => {
    keeps('el vienres 26 de junio', 'el viernes 26 de junio');
    keeps('alas 8 julio el 3', 'el 3 de julio a las 8');
    keeps('3/7 o 4-7', '3/7 o 4/7');
    keeps('20h30', '20:30');
  });

  it('minutes "00" and leading zeros add nothing', () => {
    keeps('el viernes a las 20h', 'el viernes a las 20:00');
    keeps('a las 08', 'a las 8');
    keeps('a las 9', 'a las 09:00');
  });

  it('a number written in words is the same number in digits', () => {
    keeps('el sabado a las ocho', 'el sábado a las 8');
    keeps('dissabte a les vuit del vespre', 'dissabte a les 8 del vespre');
    keeps('el veintitrés de julio', 'el 23 de julio');
    keeps('el treinta y uno de julio', 'el 31 de julio');
    keeps('a las ocho y media', 'a las 8:30');
    keeps('el segundo lunes de julio', 'el 2.º lunes de julio');
  });

  it('an edit may drop numbers (a self-correction, noise)', () => {
    keeps('el viernes a las 8, no, perdón, a las 9', 'el viernes a las 9');
    keeps('reunión en el portal 3 el martes a las 7', 'el martes a las 7');
  });

  it('an edit that changes or adds a number is discarded', () => {
    breaks('el viernes de 17:00 a 15:00', 'el viernes de 17:00 a 19:00');
    breaks(
      'el viernes a las 10 o a las 5 por la tarde',
      'el viernes a las 10 o a las 17 por la tarde',
    );
    breaks('el viernes', 'el viernes a las 20');
    breaks('el 3 de julio', 'el 3 de julio de 2026');
    breaks('a las 8 y a las 8', 'a las 8 y a las 8 y a las 8');
  });

  it('a number counted as many times as it is written', () => {
    keeps('julio el 8 a las 8', 'el 8 de julio a las 8');
    breaks('el 8 de julio', 'el 8 de julio a las 8');
  });

  it('an edit keeps every meal word that tells the half of the day', () => {
    keeps('holaa chicos, cena de clase el jueves a las 9, apuntaos!!', 'cena el jueves a las 9');
    keeps('cenita el viernes a las 9', 'cena el viernes a las 9');
    keeps('quedada para comer el domingo a las 2', 'comida el domingo a las 2');
    breaks('holaa chicos, cena de clase el jueves a las 9, apuntaos!!', 'el jueves a las 9');
    breaks('desayuno el sábado a las 9', 'el sábado a las 9');
    breaks('fem el dinar el diumenge 28 a les 2', 'el diumenge 28 a les 2');
    breaks('cena el viernes a las 9', 'comida el viernes a las 9');
  });

  it('a compound number in words is one number', () => {
    keeps(
      'um saturday the uh twentieth no wait the twenty seventh at noon',
      'Saturday the 27th at noon',
    );
    keeps('saturday the twenty-first', 'Saturday the 21st');
    keeps('dissabte vint-i-set de juny', 'dissabte 27 de juny');
    keeps('the thirtieth of june', 'the 30th of June');
    keeps('el veinte de julio', 'el 20 de julio');
    breaks('the twenty seventh', 'the 20th');
  });

  it('a number hidden behind a typo in the original is read as a person would (owner, 2026-11-12)', () => {
    keeps('pasdo mañana a las 5 y meida', 'pasado mañana a las 5 y media');
    keeps('el sabado a las sies', 'el sábado a las 6');
    breaks('el sabado a las sies', 'el sábado a las 7');
    breaks('pasdo mañana a las 5 y meida', 'pasado mañana a las 5 y cuarto');
  });

  it('a number glued to another word or split in two is still that number (owner, 2026-11-12)', () => {
    keeps('dema o dema passat alesvuit', 'demà o demà passat a les vuit');
    keeps('dema o dema passat alesvuit', 'demà o demà passat a les 8');
    keeps('quarterto nine on thursday', 'quarter to nine on thursday');
    keeps(
      'el veinti cinco o el veinti seis de junio por la tarde',
      'el veinticinco o el veintiséis de junio por la tarde',
    );
    breaks('el veinti cinco de junio', 'el 5 de junio');
    breaks('dema alesvuit', 'demà a les 9');
  });

  it('a Catalan "u" after "el"/"del" is 1; elsewhere it is "or" (owner, 2026-11-12)', () => {
    keeps('del u al cinc dagost menys el dimecres', "del 1 al 5 d'agost menys el dimecres");
    breaks('el viernes a las siete u ocho', 'el viernes 1 a las 7 u 8');
  });

  it('"a esa misma hora" lets the edit write that hour again, never a new one (owner, 2026-11-12)', () => {
    keeps(
      'el sábado a las 3... bueno, a las 3 hace un calor horrible, mejor a las 7 de la tarde, o el domingo a esa misma hora',
      'el sábado a las 7 de la tarde, o el domingo a las 7 de la tarde',
    );
    keeps('saturday at 7 or sunday same time', 'Saturday at 7 or Sunday at 7');
    keeps('dissabte a les 8 o diumenge a la mateixa hora', 'dissabte a les 8 o diumenge a les 8');
    breaks(
      'el sábado a las 7 o el domingo a esa misma hora',
      'el sábado a las 7 o el domingo a las 8',
    );
    breaks('el sábado a las 7 o el domingo', 'el sábado a las 7 o el domingo a las 7');
  });

  it('an edit that adds a word-number is still discarded: "a quarts de deu" is not "dos quarts de deu"', () => {
    breaks('ostres, doncs potser a quarts de deu el dv?? 😂', 'a dos quarts de deu el divendres?');
  });

  it('an edit keeps the order of the weekdays the original names (owner, 2026-11-12)', () => {
    breaks('el sábado o el viernes 26', 'el viernes 26 o el sábado');
    breaks('saturday or friday the 26th', 'Friday the 26th or Saturday');
    keeps('el sabado o el vienres 26', 'el sábado o el viernes 26');
    keeps('ds o dg x la tarde, sobre les 5', 'el dissabte o el diumenge a la tarda, sobre les 5');
    keeps('el lunes, el martes o el miercoles', 'el lunes o el miércoles');
    keeps(
      'el sábado a las 10 y el domingo también a las 10 de la mañana',
      'el sábado a las 10 de la mañana y el domingo a las 10 de la mañana',
    );
    breaks('finde que viene', 'el sábado o el domingo de la semana que viene'); // a weekend never split (owner, 2026-11-13)
  });

  it('an edit that names a weekday the original does not name is discarded (owner, 2026-11-12)', () => {
    breaks(
      'dm o dc de la setmana q ve, de 18 a 20h',
      'dilluns o dimecres de la setmana que ve, de 18:00 a 20:00',
    );
    keeps(
      'dm o dc de la setmana q ve, de 18 a 20h',
      'dimarts o dimecres de la setmana que ve, de 18:00 a 20:00',
    );
    keeps('dt, dj o dv', 'dimarts, dijous o divendres');
    breaks('el 26 de junio', 'el viernes 26 de junio');
    breaks('mañana a las 8', 'mañana martes a las 8');
    // a weekday one typo away in the original counts as named
    keeps('dissbate nit de les 23h', 'dissabte nit de les 23:00');
    keeps('Wendesday 24th or Thrusday 25th', 'Wednesday 24th or Thursday 25th');
    keeps('el sabdo 20', 'el sábado 20');
    // … and so does one glued to another word or shortened ("eljueves", "satorsun", "dmg")
    keeps(
      'pasadomañana porla tarde o eljueves porlatarde',
      'pasado mañana por la tarde o el jueves por la tarde',
    );
    keeps('satorsun brunch 11am', 'Saturday or Sunday brunch 11am');
    keeps('quedamos el dmg a las 10?', 'el domingo a las 10');
    keeps('el sá bado 27 a las 22:00', 'el sábado 27 a las 22:00');
    // a weekend word names no weekday
    keeps(
      'teh weekend after next, firday night thru sunday',
      'the weekend after next, Friday night through Sunday',
    );
    keeps('ds o dg x la tarde', 'el dissabte o el diumenge a la tarda');
    breaks('este finde', 'el viernes o el sábado');
    // a weekend said alone is never split into its two days (owner, 2026-11-13): R2 reads "el sábado o el domingo
    // de cualquier fin de semana" as single days, the weekend as one range
    breaks(
      'Podemos ir cualquier fin de semana de septiembre.',
      'Podemos ir el sábado o el domingo de cualquier fin de semana de septiembre.',
    );
    breaks('este finde', 'este sábado o domingo');
    breaks('next weekend', 'Saturday or Sunday next weekend');
    breaks('el cap de setmana que ve', 'dissabte o diumenge de la setmana que ve');
    keeps('el finde, el sabdo o el domingo', 'el fin de semana, el sábado o el domingo');
    // … unless the original says its days one by one ("cualquiera de los dos días", "either day")
    keeps(
      'yo lo dejaría para el finde que viene, cualquiera de los dos días',
      'el sábado o el domingo del fin de semana que viene',
    );
    keeps('next weekend works best for me, either day honestly', 'Saturday or Sunday next weekend');
  });

  it('an edit that drops a number used as a day of the month or an hour is discarded (owner, 2026-11-12)', () => {
    breaks('el divendres 26 per la nit, o sea el viernes, a les 10', 'el viernes a las 10');
    breaks('el sábado 27 a las 10', 'el sábado a las 10');
    breaks('el viernes a las 8', 'el viernes');
    breaks('Saturday the 27th at 2', 'Saturday at 2');
    breaks('dinner on 6/27 at 8pm', 'dinner at 8pm');
    breaks('el viernes a las 20:30', 'el viernes por la noche');
    // noise numbers may still be dropped
    keeps('mesa para 4 el sábado a las 9', 'el sábado a las 9');
    keeps('somos 12, el viernes 26 a las 9', 'el viernes 26 a las 9');
    // a correction or a restatement still says a day or an hour of its own
    keeps(
      'quedamos el miércoles 17 a las 8, digo el 18, el jueves, que el miércoles curro, a las 8 de la tarde',
      'el jueves 18 a las 8 de la tarde',
    );
    keeps(
      "let's do the barbecue on Saturday the 27th at 1... actually make it 2",
      'barbecue on Saturday the 27th at 2',
    );
    keeps(
      'el sábado 4, o sea el primer sábado de julio, a partir de las 8 de la tarde',
      'el primer sábado de julio a partir de las 8 de la tarde',
    );
  });

  it('an edit that drops the only month the original names is discarded (owner, 2026-11-13)', () => {
    breaks(
      'dic: ls sab 5, 12 y 19 pa la cena d navidad',
      'los sábados 5, 12 y 19 para la cena de navidad',
    );
    breaks('el 3 de julio', 'el 3 de agosto');
    keeps('dic: ls sab 5, 12 y 19', 'diciembre: los sábados 5, 12 y 19');
    keeps('el 3 de setembre o el 5 doct', "el 3 de setembre o el 5 d'octubre");
    // a phrase with two months may lose one, as with any dropped day; lowercase English "may" is no month
    keeps('el 3 de julio, no, mejor el 3 de agosto', 'el 3 de agosto');
    keeps('we may meet on friday at 8', 'meet on Friday at 8');
    // a word that only looks like a month is no month: "jo dic" (I say), "match", "la mayoría"
    keeps('jo dic dimarts 23 a la nit, porteu coca', 'el dimarts 23 a la nit');
    keeps('match in sunday at 11am', 'match on Sunday at 11am');
    keeps('como la mayoría trabajáis de mañana, el lunes por la tarde', 'el lunes por la tarde');
  });

  it('the original\'s tens split by "y", numbers glued in a run and British "half seven" are read as a person would (owner, 2026-11-13)', () => {
    keeps('elsábado27 alasdiezdelanoche', 'el sábado 27 a las 10 de la noche');
    keeps('el viernes diez y siete por la tarde', 'el viernes 17 por la tarde');
    keeps(
      'el finde del diez y ocho y diez y nueve de julio',
      'el fin de semana del 18 y 19 de julio',
    );
    keeps("right, half seven tomorrow at the Crown, who's in?", 'half past seven tomorrow');
    breaks('half seven tomorrow', 'tomorrow at 7:37');
    breaks('el viernes diez y siete por la tarde', 'el viernes 18 por la tarde');
    breaks('alasdiezdelanoche', 'a las 11 de la noche');
  });

  it('an edit that drops a date negation is discarded (owner, 2026-11-13)', () => {
    breaks(
      'este finde no puedo vale así que el siguiente sábado o domingo',
      'el sábado o el domingo del siguiente fin de semana',
    );
    breaks(
      'cualquier día de la semana que viene menos el miércoles',
      'cualquier día de la semana que viene',
    );
    breaks("this weekend I can't, so the Saturday after", 'the Saturday after this weekend');
    breaks('dissabte no puc, diumenge a les 6', 'dissabte o diumenge a les 6');
    // kept, the negation passes; a correction ("no, a las 9") and "no sé" are no date negation
    keeps(
      'cualquierdia de la semana q viene menos el miercoles',
      'cualquier día de la semana que viene menos el miércoles',
    );
    keeps('todo julio excepto el finde del 18', 'todo julio excepto el fin de semana del 18');
    keeps('el viernes a las 8, no, perdón, a las 9', 'el viernes a las 9');
    keeps('pues no sé, yo diría el primer finde de agosto', 'el primer finde de agosto');
    keeps(
      'el jueves que viene a las 9, si alguien no puede que lo diga',
      'el jueves que viene a las 9',
    );
    keeps('bueno xq no el lunes 22 a las 7', 'el lunes 22 a las 7');
  });

  it('an edit that drops a week or month reference is discarded (owner, 2026-11-13)', () => {
    breaks(
      'todas las tardes de esta semana pero dejamos fuera el viernes, así que de lunes a jueves de 6 a 8',
      'de lunes a jueves de 6 a 8',
    );
    breaks('la semana que viene, el martes o el jueves', 'el martes o el jueves');
    breaks('this week, Thursday or Friday at 8pm', 'Thursday or Friday at 8pm');
    breaks('el mes que viene, el día 3', 'el día 3');
    breaks('la setmana que ve dimarts', 'dimarts');
    // a week word the editor keeps, or writes plainly, passes
    keeps('la smana q viene el martes', 'la semana que viene el martes');
    keeps('next wk thurs or fri', 'next week, Thursday or Friday');
    keeps('el martes de esta semana', 'este martes de esta semana');
    keeps('el mes q viene el dia 3', 'el día 3 del mes que viene');
  });

  it('an edit may drop a negation together with the date it rules out (owner, 2026-11-13)', () => {
    keeps(
      'mañana no puedo, pasado mañana tampoco porque tengo turno doble, así que el jueves o el viernes, eso sí, a partir de las 6 de la tarde',
      'el jueves o el viernes a partir de las 6 de la tarde',
    );
    keeps(
      'eh el veinticuatro no que es festivo mejor el veinticinco o el veintiséis por la noche',
      'el veinticinco o el veintiséis por la noche',
    );
    keeps(
      'mañana a las 10... uy no, mañana no que tengo reunión, pasado mañana a las 10 de la mañana',
      'pasado mañana a las 10 de la mañana',
    );
    keeps(
      'cualquier día de la semana que viene me sirve, de verdad, bueno menos el finde que me voy a Valencia, así que de lunes a viernes, y mejor a la hora de comer, a las dos',
      'de lunes a viernes de la semana que viene a las dos, para comer',
    );
    keeps('el sábado no me va, el domingo a las 8', 'el domingo a las 8');
    // discarded before 2026-11-13: the negation goes with its date, as in "mañana no que tengo reunión, pasado mañana…"
    keeps('el viernes no me va, el sábado a las 8', 'el sábado a las 8');
    keeps('dissabte no puc, diumenge a les 6', 'diumenge a les 6');
    // … but a span in the edit that still covers the day left out keeps the negation needed
    breaks(
      'cualquier día de la semana que viene menos el miércoles',
      'cualquier día de la semana que viene',
    );
    breaks('todo julio excepto el finde del 18', 'todo julio');
    // the negation goes but its date stays: discarded
    breaks('mañana no puedo', 'mañana');
    breaks('cualquier día menos el viernes', 'cualquier día el viernes');
    breaks('pasado mañana tampoco, el jueves', 'pasado mañana o el jueves');
    breaks('el veinticuatro no que es festivo, el veinticinco', 'el 24 o el 25');
  });

  it('an edit may drop a week word when every day left has its day number (owner, 2026-11-13)', () => {
    keeps(
      'Para la cena de empresa de verano he mirado restaurantes y tienen hueco el jueves 2 de julio, el viernes 10 o el jueves 16, en todos a las 9 de la noche. Decidme cuál os viene mejor que tengo que reservar esta semana',
      'cena de empresa el jueves 2 de julio, el viernes 10 o el jueves 16 a las 9 de la noche',
    );
    keeps('this week, Thursday the 2nd or Friday the 3rd', 'Thursday the 2nd or Friday the 3rd');
    breaks('el viernes de esta semana', 'el viernes');
    breaks('esta semana el jueves 2 o el viernes', 'el jueves 2 o el viernes');
    breaks('esta semana por la tarde', 'por la tarde');
    breaks('el mes que viene, el día 3', 'el día 3'); // a month reference is still kept
  });

  it('an edit still settles a half of the day when the original settles one (owner, 2026-11-13)', () => {
    // a half said of an excuse or a corrected part may go, as long as one stays
    keeps(
      'como el viernes trabajo hasta tarde y el sábado por la mañana tengo a los niños, mejor el sábado por la tarde o el domingo a mediodía, lo que os vaya mejor',
      'el sábado por la tarde o el domingo a mediodía',
    );
    keeps(
      'el lunes que viene por la mañana, digo por la tarde, que por la mañana trabajo, a las 5',
      'el lunes que viene por la tarde a las 5',
    );
    keeps(
      'el viernes a las 9 de la noche y el sábado a las 11 de la mañana',
      'el viernes a las 9 y el sábado a las 11 de la mañana',
    ); // accepted cost: the reader asks about the 9
    keeps(
      'el sábado a las 10 por la mañana o a las 5 por la tarde',
      'el sábado a las 10 o a las 5 por la tarde',
    );
    breaks('noche de san juan en la playa!! el 23 desde las 10', 'el 23 desde las 10');
    breaks(
      'doncs el divendres a les vuit del vespre no millor a les nou',
      'el divendres a les nou',
    );
    breaks('dissabte a les 10 del matí', 'dissabte a les 10');
    breaks('el sábado a las 4 de la madrugada', 'el sábado a las 4');
    breaks('drinks at 8pm', 'drinks at 8');
    keeps('dinner at 8pm', 'dinner at 8'); // the meal word still settles it
    keeps('dsp d cenar el jue sobre ls 11', 'después de cenar el jueves sobre las 11'); // the meal word inside a longer phrase
    breaks('drinks at 9 tonight', 'drinks at 9');
    // kept with another spelling or form
    keeps('el viernes x la tarde', 'el viernes por la tarde');
    keeps('a las 9 de la noche', 'a las 9 de la noche');
    keeps('el sábado a las 10 por la mañana', 'el sábado a las 10 de la mañana');
    keeps('saturday at 8 in the evening', 'Saturday at 8pm');
  });
});
