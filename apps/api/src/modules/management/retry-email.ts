import type { EmailState, EmailType } from '@qando/contracts';
import {
  actingOrganizer,
  type ManagedEvents,
  type ManagementCredentials,
  type ManagementRefusal,
} from './managed-events.js';

/**
 * What retrying an email amounts to: the email, due again, or why not; besides the refusals of
 * every management request, the email had not failed (sent, still being tried, or never queued).
 */
export type EmailRetry =
  | { readonly status: 'retried'; readonly email: EmailState }
  | ManagementRefusal
  | { readonly status: 'not-failed' };

/**
 * The use case behind "Reintentar", free of HTTP like `readManagedEvent`: only the organizer
 * makes a failed email due again, at the time `now` answers, and the outbox tries it once more.
 */
export async function retryEmail(
  managedEvents: ManagedEvents,
  participationId: string,
  credentials: ManagementCredentials,
  type: EmailType,
  now: () => Date,
): Promise<EmailRetry> {
  const access = await actingOrganizer(managedEvents, participationId, credentials);
  if (access.status !== 'granted') return access;
  return (await managedEvents.retryFailedEmail(access.organizer, type, now()))
    ? { status: 'retried', email: { type, status: 'pending' } }
    : { status: 'not-failed' };
}
