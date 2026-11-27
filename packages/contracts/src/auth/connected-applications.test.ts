import { describe, expect, it } from 'vitest';
import {
  connectedApplicationsEndpoint,
  connectedApplicationsSchema,
  disconnectApplicationEndpoint,
  disconnectedSchema,
} from './connected-applications.js';

const claude = {
  id: 'Yk3s9QzX2b7Lm4Np8Rt1Vw6Hc5Jd0Fa2',
  name: 'Claude',
  host: 'claude.ai',
  connectedAt: '2026-11-24T18:30:00.000Z',
};

describe('connected applications contract', () => {
  it('accepts the applications of the account, each with its connection, name, host and date', () => {
    const chatgpt = { ...claude, id: 'b2', name: 'ChatGPT', host: 'chatgpt.com' };

    expect(connectedApplicationsSchema.parse([claude, chatgpt])).toEqual([claude, chatgpt]);
  });

  it('accepts none', () => {
    expect(connectedApplicationsSchema.parse([])).toEqual([]);
  });

  it.each([
    ['no connection', { ...claude, id: '' }],
    ['no name', { ...claude, name: '' }],
    ['no host', { ...claude, host: '' }],
    ['a date that is not an instant', { ...claude, connectedAt: '2026-11-24' }],
    ['a field missing', { id: claude.id, name: claude.name, host: claude.host }],
  ])('rejects an application with %s', (_name, application) => {
    expect(connectedApplicationsSchema.safeParse([application]).success).toBe(false);
  });

  it('drops fields that are not part of the contract', () => {
    const leaked = { ...claude, userId: 'ana', clientId: 'https://claude.ai/oauth/client.json' };

    expect(connectedApplicationsSchema.parse([leaked])).toEqual([claude]);
  });

  it('is read with the session alone, at a path of its own', () => {
    expect(connectedApplicationsEndpoint.method).toBe('get');
    expect(connectedApplicationsEndpoint.path).toBe('/api/me/connected-apps');
    expect(connectedApplicationsEndpoint.responses[200].schema).toBe(connectedApplicationsSchema);
    expect(Object.keys(connectedApplicationsEndpoint.responses)).toEqual(['200', '401', '500']);
  });
});

describe('disconnecting an application', () => {
  it('names the connection in its path, as the list gives it', () => {
    expect(disconnectApplicationEndpoint.method).toBe('delete');
    expect(disconnectApplicationEndpoint.path).toBe('/api/me/connected-apps/{id}');
    expect(disconnectApplicationEndpoint.params.parse({ id: claude.id })).toEqual({
      id: claude.id,
    });
  });

  it.each([
    ['an empty one', ''],
    ['one longer than any connection', 'x'.repeat(65)],
  ])('refuses %s', (_name, id) => {
    expect(disconnectApplicationEndpoint.params.safeParse({ id }).success).toBe(false);
  });

  it('answers that it is disconnected', () => {
    expect(disconnectedSchema.parse({ disconnected: true })).toEqual({ disconnected: true });
    expect(disconnectedSchema.safeParse({ disconnected: false }).success).toBe(false);
  });

  it('answers a connection the account does not have as not found, and a page of another site as forbidden', () => {
    expect(Object.keys(disconnectApplicationEndpoint.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '500',
    ]);
    expect(
      disconnectApplicationEndpoint.responses[404].schema.parse({
        error: { code: 'NOT_FOUND', message: 'No such connection', details: [] },
      }),
    ).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
