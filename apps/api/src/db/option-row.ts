import type { Option } from '@qando/contracts';
import type { ProposedOption } from '@qando/domain';
import type { options } from './schema.js';

type OptionRow = Pick<
  typeof options.$inferSelect,
  'id' | 'startDate' | 'endDate' | 'startTime' | 'endTime'
>;

/** An option as the API answers it, from its row: an end date makes a range, times are `HH:MM`. */
export function optionFromRow(row: OptionRow): Option {
  return {
    id: row.id,
    dates:
      row.endDate === null
        ? { kind: 'single', date: row.startDate }
        : { kind: 'range', start: row.startDate, end: row.endDate },
    time: timeOf(row.startTime, row.endTime),
  };
}

/** An option's columns: an end date makes a range; a time without an end is a single time. */
export function optionColumns({ dates, time }: ProposedOption) {
  return {
    startDate: dates.kind === 'single' ? dates.date : dates.start,
    endDate: dates.kind === 'range' ? dates.end : null,
    startTime: time === null ? null : time.kind === 'single' ? time.at : time.start,
    endTime: time?.kind === 'range' ? time.end : null,
  };
}

function timeOf(start: string | null, end: string | null): Option['time'] {
  if (start === null) return null;
  return end === null
    ? { kind: 'single', at: hoursAndMinutes(start) }
    : { kind: 'range', start: hoursAndMinutes(start), end: hoursAndMinutes(end) };
}

/** PostgreSQL answers `time` columns as `HH:MM:SS`; options never have seconds. */
function hoursAndMinutes(time: string): string {
  return time.slice(0, 5);
}
