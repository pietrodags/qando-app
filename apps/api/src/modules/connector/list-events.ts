import { myEventSchema, type MyEvent } from '@qando/contracts';
import { z } from 'zod';
import { listMyEvents } from '../management/list-my-events.js';
import type { ManagedEvents } from '../management/managed-events.js';
import { texts } from './texts.js';
import type { Tool } from './tool.js';

/**
 * The events as the API's own route answers them, their shape written out whole: under the
 * contract's names the published shape would point to definitions an application has to follow.
 */
const listedSchema = z.object({ events: z.array(z.object(myEventSchema.shape)) });

/**
 * "Ver mis eventos", the tool `list_my_events`: the account's events as "Mis eventos" lists
 * them, newest first, one line each (title, state, how many people voted, and the identifier of
 * its voting link, by which the other tools take an event), or the words of an account that has
 * none yet. The data beside the words is the same list as the API's own route answers.
 */
export function listEventsTool(
  managedEvents: ManagedEvents,
  now: () => Date,
): Tool<Record<string, never>, z.infer<typeof listedSchema>> {
  const line = ({ id, title, state, deadline, voters }: MyEvent) =>
    texts.answers.event({
      id,
      title,
      state: texts.state[state](deadline),
      voters: texts.voters(voters),
    });
  return {
    name: 'list_my_events',
    ...texts.tools.listEvents,
    readOnly: true,
    input: z.object({}),
    data: listedSchema,
    answer: async (accountId) => {
      const events = await listMyEvents(managedEvents, accountId, now);
      const text =
        events.length === 0
          ? texts.answers.noEvents
          : [texts.answers.events(events.length), ...events.map(line)].join('\n');
      return { text, data: { events } };
    },
  };
}
