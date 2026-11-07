import {
  resultsEndpoint,
  resultsSchema,
  type ErrorResponse,
  type Option,
  type Results,
  type ResultsOption,
} from '@qando/contracts';
import {
  currentState,
  resultsOf,
  type OptionTally,
  type StoredEventState,
  type VoteState,
} from '@qando/domain';
import { Router, type Response } from 'express';
import { routePath } from '../../http/route-path.js';

/** One participant's answer: a state per option ID; `name` is null on anonymous events. */
export interface StoredVote {
  readonly name: string | null;
  readonly votes: Readonly<Record<string, VoteState>>;
}

/** What the results are computed from: the event, its options in their order, and every vote. */
export type StoredResultsEvent = {
  readonly title: string;
  readonly timeZone: string;
  readonly anonymous: boolean;
  readonly options: readonly Option[];
  readonly confirmedOption: Option | null;
  readonly votes: readonly StoredVote[];
} & StoredEventState;

/**
 * What a results link leads to. The participation link of an event is told apart from an
 * unknown link: it is refused (`403`), never mistaken for an event that does not exist.
 */
export type ResultsLookup =
  | { readonly status: 'found'; readonly event: StoredResultsEvent }
  | { readonly status: 'cancelled'; readonly title: string }
  | { readonly status: 'participation-link' }
  | { readonly status: 'missing' };

/** Port to the stored events, looked up by the results ID of their link. */
export interface EventResults {
  find(resultsId: string): Promise<ResultsLookup>;
}

type Answer = Response<Results | ErrorResponse<typeof resultsEndpoint>['body']>;

/** Serves the results page: `GET /api/results/:resultsId`. */
export function resultsRouter(eventResults: EventResults, now: () => Date): Router {
  const router = Router();

  router.get(routePath(resultsEndpoint), async (request, response: Answer) => {
    const { resultsId } = resultsEndpoint.params.parse(request.params);
    const lookup = await eventResults.find(resultsId);

    // Every vote changes the results: never reuse an old answer.
    response.set('Cache-Control', 'no-store');
    switch (lookup.status) {
      case 'found':
        response.status(200).json(resultsSchema.parse(resultsOfEvent(lookup.event, now())));
        return;
      case 'participation-link':
        response.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'A participation link opens no results',
            details: [],
          },
        });
        return;
      case 'cancelled':
        response.status(410).json({
          error: {
            code: 'EVENT_CANCELLED',
            message: 'The event was cancelled',
            details: [],
            title: lookup.title,
          },
        });
        return;
      case 'missing':
        response.status(404).json({
          error: { code: 'NOT_FOUND', message: 'No event has this results link', details: [] },
        });
    }
  });

  return router;
}

/** Spanish alphabetical order: accents and case aside, `ñ` after `n`. */
const spanish = new Intl.Collator('es');

/**
 * The event's results as the page shows them: the domain's tallies with each option in full and,
 * on named events, who answered it each way. They are final once voting is no longer open.
 */
function resultsOfEvent(event: StoredResultsEvent, at: Date): Results {
  const results = resultsOf(
    event.options.map(({ id }) => id),
    event.votes.map(({ votes }) => votes),
  );
  const optionsById = new Map(event.options.map((option) => [option.id, option]));
  const optionOf = (optionId: string): Option => {
    const option = optionsById.get(optionId);
    // The tallies are of the event's own options, so each one is found.
    if (!option) throw new Error('A tally of an option the event does not have');
    return option;
  };

  const shown = ({ optionId, preferred, available, unavailable }: OptionTally): ResultsOption => ({
    option: optionOf(optionId),
    preferred,
    available,
    unavailable,
    ...(event.anonymous ? {} : { names: namesOf(optionId, event.votes) }),
  });

  return {
    title: event.title,
    timeZone: event.timeZone,
    final: currentState(event, at) !== 'open',
    outcome: results.outcome,
    voters: results.voters,
    attending: results.attending,
    notAttending: results.notAttending,
    winnersListed: results.winnersListed,
    winners: results.winners.map(shown),
    alternatives: results.alternatives.map(shown),
    confirmedOption: event.confirmedOption,
  };
}

/** The names of the voters who answered the option each way; unanswered counts as unavailable. */
function namesOf(optionId: string, votes: readonly StoredVote[]): Record<VoteState, string[]> {
  const names: Record<VoteState, string[]> = { preferred: [], available: [], unavailable: [] };
  for (const { name, votes: states } of votes) {
    if (name !== null) names[states[optionId] ?? 'unavailable'].push(name);
  }
  for (const list of Object.values(names)) list.sort(spanish.compare);
  return names;
}
