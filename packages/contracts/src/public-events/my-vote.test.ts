import { describe, expect, it } from 'vitest';
import { castVoteBodySchema, voteTokenSchema } from './cast-vote.js';
import {
  editVoteEndpoint,
  editVoteRejectedSchema,
  myVoteEndpoint,
  myVoteHeadersSchema,
  myVoteSchema,
  voteForbiddenSchema,
} from './my-vote.js';

const july6 = '0b7c2f6e-3a52-4f43-9d1e-6f0e2b9a1c11';
const july10 = '5d1e8a90-7c3b-4e2f-8a61-2b9c0d4e6f73';
const token = 'kQ7vZ2xT9bLm4Np0Rs8wYA';

describe('my vote token', () => {
  it('travels in the X-Vote-Token header, with the shape of a new token', () => {
    expect(myVoteHeadersSchema.parse({ 'x-vote-token': token, host: 'qando.app' })).toEqual({
      'x-vote-token': token,
    });
    expect(myVoteHeadersSchema.safeParse({}).success).toBe(false);
    expect(myVoteHeadersSchema.safeParse({ 'x-vote-token': `${token}=` }).success).toBe(false);
    expect(myVoteHeadersSchema.shape['x-vote-token'].safeParse('a'.repeat(64)).success).toBe(
      voteTokenSchema.safeParse('a'.repeat(64)).success,
    );
  });
});

describe('my vote', () => {
  it('is the name and one state per option, as the voting page sends them', () => {
    const vote = { name: 'Luis', votes: { [july6]: 'available', [july10]: 'preferred' } };
    expect(myVoteSchema.parse(vote)).toEqual(vote);
    expect(castVoteBodySchema.parse(myVoteSchema.parse(vote))).toEqual(vote);
  });

  it('carries no name on anonymous events', () => {
    const vote = { votes: { [july6]: 'unavailable' } };
    expect(myVoteSchema.parse(vote)).toEqual(vote);
  });

  it.each([
    ['an unknown state', { name: 'Luis', votes: { [july6]: 'maybe' } }],
    ['no votes', { name: 'Luis' }],
    ['a null name', { name: null, votes: {} }],
  ])('rejects %s', (_case, vote) => {
    expect(myVoteSchema.safeParse(vote).success).toBe(false);
  });
});

describe('my vote errors', () => {
  it('answers a token without a vote of this event with FORBIDDEN', () => {
    const body = { error: { code: 'FORBIDDEN', message: 'Not your vote', details: [] } };
    expect(voteForbiddenSchema.parse(body)).toEqual(body);
  });

  it('lists the problems of an edit, which never include a taken token', () => {
    const rejected = (details: unknown[]) => ({
      error: { code: 'VALIDATION_FAILED', message: 'The vote was rejected', details },
    });
    const body = rejected([
      { code: 'NAME_TOO_SHORT' },
      { code: 'NAME_TOO_LONG' },
      { code: 'NAME_NOT_ALLOWED' },
      { code: 'OPTION_MISSING', optionId: july6 },
      { code: 'OPTION_UNKNOWN', optionId: 'not-an-option' },
      { code: 'SEVERAL_PREFERRED', optionIds: [july6, july10] },
      { code: 'INVALID_FIELD', in: 'header', path: ['x-vote-token'] },
    ]);
    expect(editVoteRejectedSchema.parse(body)).toEqual(body);
    expect(editVoteRejectedSchema.safeParse(rejected([{ code: 'VOTE_TOKEN_TAKEN' }])).success).toBe(
      false,
    );
  });
});

describe('my vote endpoints', () => {
  it('reads the vote of the token under the participation link', () => {
    expect(myVoteEndpoint).toMatchObject({
      method: 'get',
      path: '/api/public/events/{id}/participations/mine',
      headers: myVoteHeadersSchema,
    });
    expect(myVoteEndpoint).not.toHaveProperty('body');
    expect(myVoteEndpoint.responses[200].schema).toBe(myVoteSchema);
    expect(myVoteEndpoint.responses[403].schema).toBe(voteForbiddenSchema);
    expect(Object.keys(myVoteEndpoint.responses)).toEqual([
      '200',
      '400',
      '403',
      '404',
      '410',
      '500',
    ]);
  });

  it('replaces the vote of the token with a body like a new vote, and answers it stored', () => {
    expect(editVoteEndpoint).toMatchObject({
      method: 'put',
      path: '/api/public/events/{id}/participations/mine',
      headers: myVoteHeadersSchema,
      body: castVoteBodySchema,
    });
    expect(editVoteEndpoint.responses[200].schema).toBe(myVoteSchema);
    expect(editVoteEndpoint.responses[400].schema).toBe(editVoteRejectedSchema);
    expect(editVoteEndpoint.responses[403].schema).toBe(voteForbiddenSchema);
    expect(Object.keys(editVoteEndpoint.responses)).toEqual([
      '200',
      '400',
      '403',
      '404',
      '409',
      '410',
      '500',
    ]);
  });
});
