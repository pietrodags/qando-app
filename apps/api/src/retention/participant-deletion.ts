// A participant's request to have their vote deleted, sent by email and run by hand with
// `npm run db:delete-participant`: qando keeps no participant's email, so the request names the
// vote by what the participant holds.
import { sameVoterName } from '@qando/domain';
import { and, eq } from 'drizzle-orm';
import { hashCapabilityToken } from '../capability-token.js';
import type { Database } from '../db/database.js';
import { cancelledEvents, events, participations } from '../db/schema.js';

/**
 * Whose vote a request asks to delete: by the voter's edit link (the event's ID and the token),
 * or by the event's link and the voter's name.
 */
export type VoterRequest =
  | { readonly publicId: string; readonly token: string }
  | { readonly publicId: string; readonly name: string };

/** The vote a request identifies; `name` is null on an anonymous event. */
export interface IdentifiedVote {
  readonly name: string | null;
  readonly castAt: Date;
}

/**
 * What became of a request: the vote it identifies (`found`, or `deleted` once confirmed), or why
 * it identifies none: no event has the link, the event was cancelled, a name was given for an
 * anonymous event, no vote matches, or several votes have the name.
 */
export type ParticipantDeletion =
  | { readonly outcome: 'no event' }
  | { readonly outcome: 'cancelled' | 'anonymous' | 'no vote'; readonly title: string }
  | { readonly outcome: 'several'; readonly title: string; readonly count: number }
  | {
      readonly outcome: 'found' | 'deleted';
      readonly title: string;
      readonly vote: IdentifiedVote;
    };

/**
 * Finds the one vote the request identifies and, when `confirmed`, deletes it with its answers;
 * the event and its other votes stay as they are. An edit link identifies its own vote only; a
 * name identifies a vote only when it is the event's one vote with that name (the voting page's
 * own comparison), and none on an anonymous event. Deleting again finds no vote.
 */
export async function deleteParticipant(
  db: Database,
  request: VoterRequest,
  confirmed: boolean,
): Promise<ParticipantDeletion> {
  const [event] = await db
    .select({ id: events.id, title: events.title, anonymous: events.anonymous })
    .from(events)
    .where(eq(events.publicId, request.publicId));
  if (!event) {
    const [cancelled] = await db
      .select({ title: cancelledEvents.title })
      .from(cancelledEvents)
      .where(eq(cancelledEvents.publicId, request.publicId));
    return cancelled ? { outcome: 'cancelled', title: cancelled.title } : { outcome: 'no event' };
  }
  const { title } = event;
  if ('name' in request && event.anonymous) return { outcome: 'anonymous', title };

  const votes = db
    .select({ id: participations.id, name: participations.name, castAt: participations.createdAt })
    .from(participations);
  const matches =
    'token' in request
      ? await votes.where(
          and(
            eq(participations.eventId, event.id),
            eq(participations.editTokenHash, hashCapabilityToken(request.token)),
          ),
        )
      : (await votes.where(eq(participations.eventId, event.id))).filter(
          ({ name }) => name !== null && sameVoterName(name, request.name),
        );
  const [match] = matches;
  if (!match) return { outcome: 'no vote', title };
  if (matches.length > 1) return { outcome: 'several', title, count: matches.length };

  const vote = { name: match.name, castAt: match.castAt };
  if (!confirmed) return { outcome: 'found', title, vote };
  // Its answers go with it (their key cascades). A vote changed or deleted meanwhile is deleted
  // or already gone: either way nothing of it is left.
  await db.delete(participations).where(eq(participations.id, match.id));
  return { outcome: 'deleted', title, vote };
}
