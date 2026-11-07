import type { Option } from '@qando/contracts';

/** How many times the preview shows before it only counts the rest. */
const SHOWN = 4;

/**
 * What the preview over a day of step 2 lists: its times as the organizer wrote them (`09:00`,
 * `09:00 → 11:00`), `null` for the whole day, which the page names in its language, and how many
 * more there are than it shows.
 */
export interface HourPreview {
  readonly items: readonly (string | null)[];
  readonly more: number;
}

/** The preview of a day from the times of its options, in order, each listed once. */
export function hourPreview(times: readonly Option['time'][]): HourPreview {
  const items = [...new Set(times.map(label))];
  return { items: items.slice(0, SHOWN), more: Math.max(items.length - SHOWN, 0) };
}

function label(time: Option['time']): string | null {
  if (time === null) return null;
  return time.kind === 'single' ? time.at : `${time.start} → ${time.end}`;
}
