import { z } from 'zod';
import { defineEndpoint } from '../endpoint.js';
import { internalErrorSchema, unauthenticatedSchema } from '../error.js';
import { publicEventSchema } from '../public-events/public-event.js';

export const myEventSchema = z
  .object({
    id: z.string().meta({
      description:
        'The participation ID of the event’s link, the one every management path takes: `/api/events/{id}`.',
    }),
    title: z.string(),
    state: publicEventSchema.shape.state,
    deadline: publicEventSchema.shape.deadline.meta({
      description: 'Last day of voting, in the event’s time zone.',
    }),
    voters: z.int().min(0).meta({ description: 'How many people have voted.' }),
    createdAt: z.iso.datetime().meta({ description: 'When the event was created.' }),
  })
  .meta({
    id: 'MyEvent',
    description: 'One event of the signed-in account, as its list shows it.',
  });

export type MyEvent = z.infer<typeof myEventSchema>;

export const myEventsSchema = z.array(myEventSchema).meta({
  id: 'MyEvents',
  description:
    'Every event the account created, newest first; a cancelled event is no longer one of them.',
});

export const myEventsEndpoint = defineEndpoint({
  method: 'get',
  path: '/api/me/events',
  summary: 'Lists the events of the signed-in account, newest first, each with its current state',
  tags: ['management'],
  responses: {
    200: { description: 'The account’s events, maybe none', schema: myEventsSchema },
    401: { description: 'The request carries no session', schema: unauthenticatedSchema },
    500: { description: 'The request failed unexpectedly', schema: internalErrorSchema },
  },
});
