import { z } from 'zod';

/** A calendar date, `YYYY-MM-DD`, with no zone: whoever carries it says where it is read. */
export const calendarDate = z.iso.date();

/** A wall-clock time, `HH:MM` from 00:00 to 23:59, with no zone. */
export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time as HH:MM');

/**
 * An IANA time zone name the runtime knows, e.g. `Europe/Madrid`. Never an offset such as
 * `-02:00`, which the runtime takes too but PostgreSQL reads with the opposite sign: the database
 * counts an event's days in its time zone.
 */
export const timeZoneName = z.string().refine((name) => {
  if (/^[+-]/.test(name)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
  } catch {
    return false;
  }
  return true;
});
