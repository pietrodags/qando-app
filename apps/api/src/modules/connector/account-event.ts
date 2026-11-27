import type { ManagedEvent } from '@qando/contracts';
import type { ManagedEvents, ManagementRefusal } from '../management/managed-events.js';
import { readManagedEvent } from '../management/read-managed-event.js';
import { texts } from './texts.js';
import type { Refused } from './tool.js';

/**
 * The words that refuse a call about an event the account cannot act on: a cancelled one says so
 * with its title; another organizer's and one that does not exist are answered alike, so nothing
 * is revealed.
 */
export const refusalOf = (refusal: ManagementRefusal): Refused =>
  refusal.status === 'cancelled'
    ? { refused: texts.answers.cancelled(refusal.title) }
    : { refused: texts.answers.notFound };

/**
 * One of the account's events as its management page reads it now, for a tool that acts on it,
 * or the words that refuse the call (`refusalOf`).
 */
export async function accountEvent(
  managedEvents: ManagedEvents,
  accountId: string,
  id: string,
  now: () => Date,
): Promise<ManagedEvent | Refused> {
  const reading = await readManagedEvent(managedEvents, id, { accountId }, now);
  return reading.status === 'found' ? reading.event : refusalOf(reading);
}

/**
 * As `accountEvent`, for a tool that decides something a confirmed date has decided for good
 * (the date, the deadline, closing voting): an event whose date is confirmed is refused with that
 * date, as a confirmation is final.
 */
export async function undecidedEvent(
  managedEvents: ManagedEvents,
  accountId: string,
  id: string,
  now: () => Date,
): Promise<ManagedEvent | Refused> {
  const event = await accountEvent(managedEvents, accountId, id, now);
  if ('refused' in event || event.confirmedOption === null) return event;
  const { dates, time } = event.confirmedOption;
  return { refused: texts.confirm.already(event.title, dates, time) };
}
