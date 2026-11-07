import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import {
  errorBodySchema,
  internalErrorSchema,
  rateLimitedResponse,
  validationFailedSchema,
} from '../error.js';
import {
  eventCancelledSchema,
  eventNotFoundSchema,
  optionSchema,
} from '../public-events/public-event.js';

const count = z.int().min(0);

/** Who answered an option each way, each list in Spanish alphabetical order. */
const namesSchema = z
  .object({
    preferred: z.array(z.string()),
    available: z.array(z.string()),
    unavailable: z.array(z.string()),
  })
  .meta({ id: 'ResultsNames' });

export const resultsOptionSchema = z
  .object({
    option: optionSchema,
    preferred: count,
    available: count,
    unavailable: count,
    names: namesSchema.optional().meta({ description: 'Absent on anonymous events.' }),
  })
  .meta({
    id: 'ResultsOption',
    description: 'One option shown in the results; its attendance is `preferred + available`.',
  });

export type ResultsOption = z.infer<typeof resultsOptionSchema>;

export const resultsSchema = z
  .object({
    title: z.string(),
    timeZone: z.string().meta({ description: 'IANA name, e.g. `Europe/Madrid`.' }),
    final: z.boolean().meta({
      description: 'False while voting is open (the results are provisional), true after.',
    }),
    outcome: z
      .enum(['no-votes', 'nobody-can-attend', 'one', 'two', 'three', 'several', 'all'])
      .meta({
        description:
          'Which sentence the results say: no winner (`no-votes`, `nobody-can-attend`), one, two, three or four or more winners (`several`), or every option winning (`all`).',
      }),
    voters: count,
    attending: count.meta({ description: 'Voters who can attend a winner; 0 with no winner.' }),
    notAttending: count,
    winnersListed: z
      .boolean()
      .meta({ description: 'Whether the winners are listed under the sentence: one to three.' }),
    winners: z.array(resultsOptionSchema).meta({ description: 'In chronological order.' }),
    alternatives: z.array(resultsOptionSchema).meta({
      description:
        'As well attended as the winners but less preferred: most preferred first, then in chronological order.',
    }),
    confirmedOption: optionSchema.nullable(),
  })
  .meta({
    id: 'Results',
    description:
      'What the votes of an event amount to: the winners and their alternatives, never a full ranking.',
  });

export type Results = z.infer<typeof resultsSchema>;

export const resultsForbiddenSchema = errorBodySchema('FORBIDDEN', {}).meta({
  id: 'ResultsForbidden',
  description: 'The ID is the participation link of an event, which never opens its results.',
});

export const resultsEndpoint = defineEndpoint({
  method: 'get',
  path: '/api/results/{resultsId}',
  summary: 'Reads the results of an event through its results link',
  tags: ['results'],
  params: z.object({
    resultsId: z.string().min(1).meta({ description: 'The results ID of the link.' }),
  }),
  responses: {
    200: { description: 'The results as they stand now', schema: resultsSchema },
    400: { description: 'The link is malformed', schema: validationFailedSchema },
    403: { description: 'The participation link opens no results', schema: resultsForbiddenSchema },
    404: { description: 'No event has this results link', schema: eventNotFoundSchema },
    410: { description: 'The event was cancelled', schema: eventCancelledSchema },
    429: rateLimitedResponse,
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});
