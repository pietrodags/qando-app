import { localDate } from '@qando/domain';

/**
 * Today as `YYYY-MM-DD`: the date the clocks of `timeZone` show, or the person's own clock and
 * time zone without one; read as the API reads it.
 */
export function today(timeZone?: string): string {
  return localDate(new Date(), timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
}
