// The Spanish words of the date reader, as data. Adding a synonym or an abbreviation is adding
// it to a row here and a case to the evaluation set; the grammar never names a word.
import type { Language } from './term.js';

export const es: Language = {
  words: [
    // ── weekdays (v: 0 = Sunday … 6 = Saturday) ───────────────────────────────
    [{ t: 'WD', v: 0 }, 'domingo|dom'],
    [{ t: 'WD', v: 1 }, 'lunes|lun'],
    [{ t: 'WD', v: 2 }, 'martes|mar'],
    // "x" is chat for "miércoles" ("el x a las 20:00")
    [{ t: 'WD', v: 3 }, 'miercoles|mie|mier|x'],
    [{ t: 'WD', v: 4 }, 'jueves|jue|juev'],
    [{ t: 'WD', v: 5 }, 'viernes|vie|vier'],
    [{ t: 'WD', v: 6 }, 'sabado|sab'],
    [{ t: 'WD', v: 0, plural: true }, 'domingos'],
    [{ t: 'WD', v: 6, plural: true }, 'sabados'],

    // ── months (v: 1–12) ──────────────────────────────────────────────────────
    [{ t: 'MO', v: 1 }, 'enero|ene'],
    [{ t: 'MO', v: 2 }, 'febrero|feb'],
    [{ t: 'MO', v: 3 }, 'marzo'],
    [{ t: 'MO', v: 4 }, 'abril|abr'],
    [{ t: 'MO', v: 5 }, 'mayo'],
    [{ t: 'MO', v: 6 }, 'junio|jun'],
    [{ t: 'MO', v: 7 }, 'julio|jul'],
    [{ t: 'MO', v: 8 }, 'agosto'],
    [{ t: 'MO', v: 9 }, 'septiembre|sep|setiembre'],
    [{ t: 'MO', v: 10 }, 'octubre|oct'],
    [{ t: 'MO', v: 11 }, 'noviembre|nov'],
    [{ t: 'MO', v: 12 }, 'diciembre|dic'],

    // ── numbers ───────────────────────────────────────────────────────────────
    [{ t: 'NUM', v: 1 }, 'uno'],
    [{ t: 'NUM', v: 2 }, 'dos'],
    [{ t: 'NUM', v: 3 }, 'tres'],
    [{ t: 'NUM', v: 4 }, 'cuatro'],
    [{ t: 'NUM', v: 5 }, 'cinco'],
    [{ t: 'NUM', v: 6 }, 'seis'],
    [{ t: 'NUM', v: 7 }, 'siete'],
    [{ t: 'NUM', v: 8 }, 'ocho'],
    [{ t: 'NUM', v: 9 }, 'nueve'],
    [{ t: 'NUM', v: 10 }, 'diez'],
    [{ t: 'NUM', v: 11 }, 'once'],
    [{ t: 'NUM', v: 12 }, 'doce'],
    [{ t: 'NUM', v: 13 }, 'trece'],
    [{ t: 'NUM', v: 14 }, 'catorce'],
    [{ t: 'NUM', v: 15 }, 'quince'],
    [{ t: 'NUM', v: 16 }, 'dieciseis'],
    [{ t: 'NUM', v: 17 }, 'diecisiete'],
    [{ t: 'NUM', v: 18 }, 'dieciocho'],
    [{ t: 'NUM', v: 19 }, 'diecinueve'],
    [{ t: 'NUM', v: 20 }, 'veinte'],
    [{ t: 'NUM', v: 21 }, 'veintiuno'],
    [{ t: 'NUM', v: 22 }, 'veintidos'],
    [{ t: 'NUM', v: 23 }, 'veintitres'],
    [{ t: 'NUM', v: 24 }, 'veinticuatro'],
    [{ t: 'NUM', v: 25 }, 'veinticinco'],
    [{ t: 'NUM', v: 26 }, 'veintiseis'],
    [{ t: 'NUM', v: 27 }, 'veintisiete'],
    [{ t: 'NUM', v: 28 }, 'veintiocho'],
    [{ t: 'NUM', v: 29 }, 'veintinueve'],
    [{ t: 'NUM', v: 30 }, 'treinta'],
    [{ t: 'NUM', v: 31 }, 'treinta y uno'],
    // "una cena", "un día": a number only where the grammar expects one.
    [{ t: 'NUM', v: 1, weak: true }, 'un|una'],

    // Ordinals (v: -1 = last).
    [{ t: 'ORD', v: 1 }, 'primer|primero|primera'],
    [{ t: 'ORD', v: 2 }, 'segundo|segunda'],
    [{ t: 'ORD', v: 3 }, 'tercer|tercero|tercera'],
    [{ t: 'ORD', v: 4 }, 'cuarto|cuarta'],
    [{ t: 'ORD', v: 5 }, 'quinto|quinta'],
    [{ t: 'ORD', v: -1 }, 'ultimo|ultima|ultimos|ultimas'],
    [{ t: 'ORD', v: 1 }, 'primeros|primeras'],
    [{ t: 'ORD', v: -2 }, 'penultimo|penultima'],
    [{ t: 'ORDSUF' }, 'º|ª|er'],

    // ── grammar words ─────────────────────────────────────────────────────────
    [{ t: 'ART' }, 'el|la|lo|en'],
    [{ t: 'ARTPL' }, 'los'],
    // before a number it is an hour, never a day ("de las 22", "y las 12")
    [{ t: 'ARTPL', hours: true }, 'las'],
    [{ t: 'DE' }, 'de'],
    [{ t: 'DEL' }, 'del'],
    [{ t: 'AL' }, 'al'],
    [{ t: 'A' }, 'a'],
    [{ t: 'UNTIL' }, 'hasta|hasta el dia'],
    [{ t: 'FROM' }, 'desde|a partir del|a partir de'],
    [{ t: 'BETWEEN' }, 'entre'],
    [{ t: 'FROMNOW' }, 'de aqui al|de aqui a|de hoy al|de hoy a|desde hoy hasta'],
    [{ t: 'END' }, 'finales|final|fin|fines|ultimos de'],
    // A vague part of a month or a week ("a mediados de julio"): never guessed (R23).
    [{ t: 'PART' }, 'principios|principio|comienzos|inicios|mediados|mitad'],
    // The occurrence after the coming one (R25).
    [
      { t: 'AFTERNEXT' },
      'siguiente al que viene|siguiente a la que viene|siguiente al proximo|siguiente a la proxima|despues del que viene|despues de la que viene|despues del proximo|despues de la proxima',
    ],
    // "Este viernes no, el siguiente": one occurrence rejected for the one after it, not understood by decision.
    [{ t: 'NEG' }, 'no'],
    [{ t: 'AND' }, 'y|e|ni'],
    // "excepto el jueves, y también el sábado": a day added, never one more left out (R16)
    [{ t: 'AND', also: true }, 'tambien|y tambien'],
    // "si no el martes" (or else) but "si no llueve" (a condition, R27)
    [{ t: 'OR', cond: true }, 'si no'],
    [{ t: 'OR' }, 'o|u|o si no|o sino|sino|o bien|o quiza|o quizas|o tal vez'],
    [{ t: 'EVERY' }, 'todos|todas|cada|cada uno de|todos y cada uno de'],
    [{ t: 'ANY' }, 'cualquier|cualquiera'],
    [{ t: 'NEXT' }, 'proximo|proxima|proximos|proximas|prox|que viene|que vienen|entrante'],
    // "el siguiente sábado": alone the coming one; after a named weekend, its day of the weekend after (R25; owner, 2026-11-13)
    [{ t: 'NEXT', after: true }, 'siguiente|siguientes'],
    [{ t: 'THIS' }, 'este|esta|estos|estas'],
    [{ t: 'PAST' }, 'pasado|pasada'],
    [{ t: 'WEEK' }, 'semana|sem'],
    [{ t: 'WEEKS' }, 'semanas'],
    [{ t: 'WEEKEND' }, 'finde|fin de semana|finde semana'],
    // "todo el fin de semana": a weekend said whole; after a weekend already named it is that one (R2; owner, 2026-11-13)
    [
      { t: 'WEEKEND', whole: true },
      'todo el fin de semana|todo el finde|el fin de semana entero|el finde entero',
    ],
    // Monday to Friday of the days said: "entre semana", "laborable" (R9; owner, 2026-11-13)
    [{ t: 'WORKDAYS' }, 'entre semana|laborable|laborables|dia laborable|dias laborables'],
    // The coming year: "el sábado 9 de enero del año que viene" (R4; owner, 2026-11-13)
    [{ t: 'NEXTYEAR' }, 'ano que viene|el ano que viene|el proximo ano|proximo ano'],
    [{ t: 'WEEKENDPL' }, 'findes|fines de semana'],
    [{ t: 'MONTH' }, 'mes'],
    [{ t: 'EACHMONTH' }, 'cada mes|todos los meses'],
    [{ t: 'DAY' }, 'dia'],
    [{ t: 'DAYS' }, 'dias'],
    [{ t: 'HALF' }, 'quincena'],
    [{ t: 'TODAY' }, 'hoy|hoy mismo'],
    // right after a weekday it is the morning ("sábado mañana")
    [{ t: 'TOMORROW', morning: true }, 'manana'],
    [{ t: 'DAYAFTER' }, 'pasado manana'],
    [{ t: 'YESTERDAY' }, 'ayer|anteayer|antes de ayer'],
    [{ t: 'WITHIN' }, 'dentro de|en unos|en unas'],
    [{ t: 'BEFORE' }, 'antes de|antes del'],
    [
      { t: 'EXCEPT' },
      'menos|salvo|excepto|sin|quitando|pero no|a excepcion de|a excepcion del|sin contar',
    ],

    // ── times ─────────────────────────────────────────────────────────────────
    [
      { t: 'AT' },
      'a las|a la|sobre las|sobre la|hacia las|a eso de las|como a las|como a la|como sobre las',
    ],
    // "a las 11 o así": the hour as said (R10)
    [{ t: 'ABOUT' }, 'o asi|aproximadamente|aprox|y algo|y pico'],
    [{ t: 'ATFROM' }, 'a partir de las|a partir de la|desde las|desde la'],
    // "a cualquier hora a partir de las 6": the hour after it, as "a partir de las 6" (R10; owner, 2026-11-13)
    [{ t: 'ANYTIME' }, 'a cualquier hora|cualquier hora'],
    // "a la misma hora": the last hour said (R13; owner, 2026-11-13)
    [{ t: 'SAMEHOUR' }, 'a la misma hora|a esa misma hora|a la misma|misma hora'],
    // "siempre por la tarde": the time is each day's (R13; owner, 2026-11-13)
    [{ t: 'EACH' }, 'siempre'],
    // "viernes los dos": both of the options said (owner, 2026-11-13); "los dos" alone is read in context (the tokenizer)
    [{ t: 'EACH' }, 'ambos|ambas|los dos dias'],
    [{ t: 'NOON' }, 'mediodia|medio dia'],
    // "al mediodía": noon alone; beside a bare hour from 1 to 4, a lunch word that settles it (R28, owner, 2026-11-13)
    [{ t: 'NOON', lunch: true }, 'al mediodia|al medio dia'],
    [{ t: 'MIDNIGHT' }, 'medianoche|media noche'],
    [{ t: 'H' }, 'hs|horas|hora'],
    [{ t: 'MIN', v: 30 }, 'y media'],
    // also the end of a list of ordinals ("el segundo y cuarto sábado")
    [{ t: 'MIN', v: 15, fourth: true }, 'y cuarto'],
    [{ t: 'MIN', v: -15 }, 'menos cuarto'],
    // "todo el día": the whole day, no time (R9)
    [{ t: 'ALLDAY' }, 'todo el dia|todo el dia entero|el dia entero'],
    [{ t: 'PM' }, 'de la tarde|de tarde'],
    // "las 12 de la noche" is midnight (R29)
    [{ t: 'PM', twelve: 24 }, 'de la noche|de noche'],
    [{ t: 'AM' }, 'de la madrugada'],
    // "las 12 del mediodía" is noon, "la 1 del mediodía" 13:00
    [{ t: 'PM', twelve: 12 }, 'del mediodia'],
    // "las 12 de la mañana" is noon
    [{ t: 'AM', twelve: 12 }, 'de la manana'],
    // Today named by a part of the day: today, with the part reported as vague unless a clock time follows.
    [{ t: 'TODAYPART', half: 'PM' }, 'esta tarde|esta noche'],
    [{ t: 'TODAYPART', half: 'AM' }, 'esta manana'],
    // Vague words that still say the half of the day: with a clock time they settle it (R28) and are not reported.
    [
      { t: 'VAGUE', half: 'PM' },
      'por la tarde|por la noche|por las tardes|por las noches|a la tarde|a la noche|tarde|noche|tardes|noches|tarde noche|por la tarde noche',
    ],
    [{ t: 'VAGUE', half: 'AM' }, 'por la manana|por las mananas'],
    [
      { t: 'VAGUE' },
      'a mediatarde|a media tarde|a media manana|a primera hora|a ultima hora|temprano|a la hora de cenar|despues de comer|despues de cenar',
    ],
    // Lunch words: alone a vague time (R9); with a bare hour they say afternoon, as "comida" does (R28)
    [{ t: 'VAGUE', meal: 'PM', hours: [1, 4] }, 'a la hora de comer|a la hora de la comida'],
    // after work settles pm for a bare hour (R28; owner, 2026-11-13)
    [
      { t: 'VAGUE', half: 'PM' },
      'despues del trabajo|despues de currar|despues del curro|despues de trabajar',
    ],
    // plural "las mañanas": the part of the day, never tomorrow (R9; owner, 2026-11-13)
    [{ t: 'VAGUE', half: 'AM' }, 'las mananas|mananas|las madrugadas|madrugadas'],

    // ── holidays (fixed date) and movable ones (not understood for now, R17) ──
    [{ t: 'HOLIDAY', month: 12, day: 25 }, 'navidad|navidades'],
    [{ t: 'HOLIDAY', month: 12, day: 24 }, 'nochebuena'],
    [{ t: 'HOLIDAY', month: 12, day: 31 }, 'nochevieja|fin de ano'],
    [{ t: 'HOLIDAY', month: 1, day: 1 }, 'ano nuevo'],
    [{ t: 'HOLIDAY', month: 1, day: 6 }, 'reyes|los reyes|reyes magos|dia de reyes'],
    [{ t: 'HOLIDAY', month: 6, day: 24 }, 'san juan'],
    // The eve of San Juan is the night of 23 June (owner, 2026-11-13); said "noche de", it also settles pm for a bare hour (R28)
    [{ t: 'HOLIDAY', month: 6, day: 23 }, 'verbena de san juan|la verbena de san juan'],
    [{ t: 'HOLIDAY', month: 6, day: 23, meal: 'PM' }, 'noche de san juan|la noche de san juan'],
    [{ t: 'HOLIDAY', month: 2, day: 14 }, 'san valentin'],
    [{ t: 'HOLIDAY', month: 5, day: 1 }, 'primero de mayo|dia del trabajo|dia del trabajador'],
    [{ t: 'HOLIDAY', month: 8, day: 15 }, 'la asuncion|quince de agosto'],
    [{ t: 'HOLIDAY', month: 9, day: 11 }, 'la diada|diada'],
    [{ t: 'HOLIDAY', month: 10, day: 12 }, 'el pilar|dia de la hispanidad|la hispanidad'],
    [{ t: 'HOLIDAY', month: 10, day: 31 }, 'halloween'],
    [{ t: 'HOLIDAY', month: 11, day: 1 }, 'todos los santos'],
    [{ t: 'HOLIDAY', month: 12, day: 6 }, 'dia de la constitucion'],
    [{ t: 'HOLIDAY', month: 12, day: 8 }, 'la inmaculada|la purisima'],
    // "San Juan, que es martes 23": the date that follows names the holiday's day (R17)
    [{ t: 'NAMELY' }, 'que es|que sera'],
    // "o sea el viernes": the day already said, said again (R24; owner, 2026-11-13)
    [{ t: 'NAMELY' }, 'o sea|es decir'],
    [
      { t: 'MOVABLE' },
      'semana santa|pascua|puente|carnaval|carnavales|viernes santo|jueves santo|pentecostes|lunes de pascua|corpus',
    ],

    // A condition that has nothing to do with dates ("si arreglan el coche"): ignored up to the next date (R27).
    [{ t: 'COND' }, 'si|siempre que|a menos que|salvo que|a no ser que'],

    // ── noise: words around the dates, never reported as not understood ───────
    [
      { t: 'FILLER' },
      'quedamos|quedar|quedada|quedamos para|almuerzo|reunion|fiesta|cumple|cumpleanos|barbacoa|excursion|viaje|escapada|partido|cafe|canas|birras',
    ],
    [
      { t: 'FILLER' },
      'con|grupo|para|pa|por|que|nos|vemos|vernos|podemos|podriamos|podria|puede|pueden|ser|seria|sea|mejor|os|va|bien|viene|crea|crear|un evento|evento|plan|hacemos|hacer|hagamos|tal|vez|quiza|quizas|pues|creo|como|opcion|opciones|propongo|proponer|fechas|fecha|tipo|sobre|mas o menos|igual|me|te|se|nos va|yo|puedo|a ver|pongamos|pon|ponme|digamos|estaria|genial|gracias|porfa|por favor|hola|buenas|tambien vale|vale|venga|oye|mira|chicos|gente|familia|equipo|en punto',
    ],
    [{ t: 'FILLER' }, 'por ejemplo'],
    // a game's name (owner, 2026-11-13)
    [{ t: 'FILLER' }, 'futbol sala'],

    // Words that speak of when without saying it: alone they make a phrase *unclear*, not *does not fit* (R30).
    [{ t: 'WHEN' }, 'cuando|pronto|luego|despues|antes|algun dia|un dia|otro dia'],
    // A meal word says the half of the day of a bare hour (R28): "cena a las 9" is 21:00.
    [{ t: 'FILLER', half: 'AM' }, 'desayuno|desayunar|desayunamos'],
    [{ t: 'FILLER', half: 'PM' }, 'cena|cenar|cenita|cenamos'],
    // Lunch and "merienda" words say afternoon only for the hours such a meal can start at (R28);
    // "almuerzo" (mid-morning in some places, lunch in others) and any other word say nothing.
    [{ t: 'FILLER', half: 'PM', hours: [1, 4] }, 'comida|comer|comemos'],
    [{ t: 'FILLER', half: 'PM', hours: [4, 8] }, 'merienda|merendar|merendamos'],
  ],
  notTypos: [
    'vienes',
    'martes',
    'lunar',
    'juego',
    'marco',
    'mayor',
    'juntos',
    'junto',
    'tardar',
    'noches',
    'mesa',
    'todo',
    'toda',
    'cara',
    'casa',
    'cada',
    'hasta',
    'sobra',
    'salgo',
    'salvo',
    'menor',
    'entra',
    'entro',
    'desea',
  ],
};
