import { resolve } from './calendar.js';
import type { DatesRead } from './dates-read.js';
import { read } from './phrase-reader.js';

/**
 * Reads a phrase that says when an event could take place and answers its options.
 *
 * @param text the phrase as the organizer wrote it, in Spanish, Catalan or English.
 * @param context `today`: the day the phrase is written on (YYYY-MM-DD), which every relative
 *   date counts from; `region`: the region of the organizer's browser ("ES", "US"…), which says
 *   whether a date in figures is day/month or month/day.
 */
export function readDates(text: string, context: { today: string; region?: string }): DatesRead {
  return resolve(read(text, context.region), context.today);
}
