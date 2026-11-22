import { describe, expect, it } from 'vitest';
import { eventCancelledSchema } from '../public-events/public-event.js';
import { cancelEventEndpoint, cancellationSchema } from './cancel-event.js';

describe('cancel event contract', () => {
  it('answers the cancelled event’s title, the text to forward being the page’s own', () => {
    expect(cancellationSchema.parse({ title: 'Cena de verano' })).toEqual({
      title: 'Cena de verano',
    });
  });

  it('keeps nothing else of the event in the answer', () => {
    expect(
      cancellationSchema.parse({
        title: 'Cena de verano',
        resultsId: 'Qw7p2',
        deadline: '2026-07-01',
      }),
    ).toEqual({ title: 'Cena de verano' });
  });

  it('needs the title', () => {
    expect(cancellationSchema.safeParse({}).success).toBe(false);
  });

  it('is served by DELETE /api/events/{id} with no body, refusing a repeat with 410 and the title', () => {
    expect(cancelEventEndpoint.method).toBe('delete');
    expect(cancelEventEndpoint.path).toBe('/api/events/{id}');
    expect('body' in cancelEventEndpoint).toBe(false);
    expect(cancelEventEndpoint.responses[200].schema).toBe(cancellationSchema);
    expect(cancelEventEndpoint.responses[410].schema).toBe(eventCancelledSchema);
    expect(Object.keys(cancelEventEndpoint.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '410',
      '429',
      '500',
    ]);
  });

  it('takes the event of the link and reads only the management token among the headers', () => {
    expect(cancelEventEndpoint.params.parse({ id: 'k3Jd9' })).toEqual({ id: 'k3Jd9' });
    expect(cancelEventEndpoint.params.safeParse({ id: '' }).success).toBe(false);
    expect(
      cancelEventEndpoint.headers.parse({ 'x-management-token': 'a'.repeat(22), cookie: 'a=1' }),
    ).toEqual({ 'x-management-token': 'a'.repeat(22) });
  });
});
