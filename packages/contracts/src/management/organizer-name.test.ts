import { describe, expect, it } from 'vitest';
import { organizerNameEndpoint, organizerNameSchema } from './organizer-name.js';

describe('organizer name contract', () => {
  it('accepts the name of the account’s last event', () => {
    expect(organizerNameSchema.parse({ organizerName: 'Ana G.' })).toEqual({
      organizerName: 'Ana G.',
    });
  });

  it('accepts none, for an account without an event', () => {
    expect(organizerNameSchema.parse({ organizerName: null })).toEqual({ organizerName: null });
  });

  it.each([
    ['no name at all', {}],
    ['a name that is not text', { organizerName: 7 }],
  ])('rejects %s', (_name, answer) => {
    expect(organizerNameSchema.safeParse(answer).success).toBe(false);
  });

  it('drops fields that are not part of the contract', () => {
    const leaked = { organizerName: 'Ana', ownerId: 'ana', title: 'Cena' };
    expect(organizerNameSchema.parse(leaked)).toEqual({ organizerName: 'Ana' });
  });

  it('is read with the session alone, at a path of its own', () => {
    expect(organizerNameEndpoint.method).toBe('get');
    expect(organizerNameEndpoint.path).toBe('/api/me/organizer-name');
    expect(organizerNameEndpoint.responses[200].schema).toBe(organizerNameSchema);
    expect(Object.keys(organizerNameEndpoint.responses)).toEqual(['200', '401', '500']);
  });
});
