import { describe, expect, it } from 'vitest';
import {
  castVoteBodySchema,
  castVoteEndpoint,
  castVoteHeadersSchema,
  voteRejectedSchema,
  voteTokenSchema,
  votingClosedSchema,
} from './cast-vote.js';

const july6 = '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11';
const july10 = '5d1e8a90-7c3b-4e2f-8a61-2b9c0d4e6f73';

describe('vote token', () => {
  it.each([
    ['128 random bits in base64url', 'kQ7vZ2xT9bLm4Np0Rs8wYA'],
    ['256 random bits in base64url', 'kQ7vZ2xT9bLm4Np0Rs8wYAkQ7vZ2xT9bLm4Np0Rs8wY'],
    ['the longest accepted', 'a'.repeat(64)],
    ['dashes and underscores', 'kQ7vZ2xT9bLm4Np0Rs8-_A'],
  ])('accepts %s', (_case, token) => {
    expect(voteTokenSchema.parse(token)).toBe(token);
  });

  it.each([
    ['shorter than 128 bits', 'kQ7vZ2xT9bLm4Np0Rs8wY'],
    ['longer than 64 characters', 'a'.repeat(65)],
    ['characters outside base64url', 'kQ7vZ2xT9bLm4Np0Rs8wY+'],
    ['padding', 'kQ7vZ2xT9bLm4Np0Rs8wYA=='],
    ['spaces around it', ' kQ7vZ2xT9bLm4Np0Rs8wYA'],
    ['a line inside it', 'kQ7vZ2xT9bL\nm4Np0Rs8wYA'],
  ])('rejects %s', (_case, token) => {
    expect(voteTokenSchema.safeParse(token).success).toBe(false);
  });

  it('travels in the X-Vote-Token header, read by Express in lower case', () => {
    const token = 'kQ7vZ2xT9bLm4Np0Rs8wYA';
    expect(castVoteHeadersSchema.parse({ 'x-vote-token': token, host: 'qando.app' })).toEqual({
      'x-vote-token': token,
    });
    expect(castVoteHeadersSchema.safeParse({}).success).toBe(false);
  });
});

describe('cast vote body', () => {
  it('takes the name and one state per option', () => {
    const body = { name: 'Luis', votes: { [july6]: 'available', [july10]: 'preferred' } };
    expect(castVoteBodySchema.parse(body)).toEqual(body);
  });

  it('takes no name, for anonymous events', () => {
    const body = { votes: { [july6]: 'unavailable' } };
    expect(castVoteBodySchema.parse(body)).toEqual(body);
  });

  it.each([
    ['an unknown state', { name: 'Luis', votes: { [july6]: 'maybe' } }],
    ['a name that is not text', { name: 7, votes: { [july6]: 'available' } }],
    ['no votes', { name: 'Luis' }],
    ['fields the contract does not have', { name: 'Luis', votes: {}, email: 'l@example.com' }],
    ['no body', undefined],
  ])('rejects %s', (_case, body) => {
    expect(castVoteBodySchema.safeParse(body).success).toBe(false);
  });

  // Which options a vote must answer depends on the event: the domain checks it, not the schema.
  it('leaves the options answered to the vote validation', () => {
    expect(castVoteBodySchema.safeParse({ votes: {} }).success).toBe(true);
    expect(castVoteBodySchema.safeParse({ votes: { 'not-an-option': 'available' } }).success).toBe(
      true,
    );
  });
});

describe('cast vote errors', () => {
  const rejected = (details: unknown[]) => ({
    error: { code: 'VALIDATION_FAILED', message: 'The vote was rejected', details },
  });

  it('lists every problem of the vote in the details', () => {
    const body = rejected([
      { code: 'NAME_TOO_SHORT' },
      { code: 'OPTION_MISSING', optionId: july6 },
      { code: 'OPTION_UNKNOWN', optionId: 'not-an-option' },
      { code: 'SEVERAL_PREFERRED', optionIds: [july6, july10] },
      { code: 'NAME_TOO_LONG' },
      { code: 'NAME_NOT_ALLOWED' },
      { code: 'VOTE_TOKEN_TAKEN' },
      { code: 'INVALID_FIELD', in: 'body', path: ['votes', july6] },
      { code: 'INVALID_FIELD', in: 'header', path: ['x-vote-token'] },
    ]);
    expect(voteRejectedSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['an unknown problem', { code: 'TOO_LATE' }],
    ['a missing option without its ID', { code: 'OPTION_MISSING' }],
    ['a field in an unknown place', { code: 'INVALID_FIELD', in: 'cookie', path: [] }],
  ])('rejects %s', (_case, detail) => {
    expect(voteRejectedSchema.safeParse(rejected([detail])).success).toBe(false);
  });

  it('answers a closed event with VOTING_CLOSED', () => {
    const body = { error: { code: 'VOTING_CLOSED', message: 'Voting is closed', details: [] } };
    expect(votingClosedSchema.parse(body)).toEqual(body);
  });
});

describe('cast vote endpoint', () => {
  it('creates a participation under the participation link', () => {
    expect(castVoteEndpoint).toMatchObject({
      method: 'post',
      path: '/api/public/events/{id}/participations',
      headers: castVoteHeadersSchema,
      body: castVoteBodySchema,
    });
    expect(Object.keys(castVoteEndpoint.responses)).toEqual([
      '201',
      '400',
      '404',
      '409',
      '410',
      '429',
      '500',
    ]);
  });

  it('answers only the participation ID: the voter already holds the token', () => {
    const created = castVoteEndpoint.responses[201].schema;
    expect(created.parse({ participationId: july6 })).toEqual({ participationId: july6 });
    expect(created.safeParse({ participationId: 'p-1' }).success).toBe(false);
  });
});
