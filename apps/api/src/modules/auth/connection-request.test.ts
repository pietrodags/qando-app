import { describe, expect, it } from 'vitest';
import { askedAgain } from './connection-request.js';

/** The parameters of a query, in order, as a browser would send them. */
const parametersOf = (query: string) => [...new URLSearchParams(query)];

describe('a request to connect asked again after signing in', () => {
  it('asks what the application asked, without what signed it for the sign-in page', () => {
    const signed = new URLSearchParams([
      ['response_type', 'code'],
      ['client_id', 'https://claude.example/app.json'],
      ['redirect_uri', 'https://claude.example/back?from=qando&to=chat'],
      ['scope', 'events:read events:manage offline_access'],
      ['state', 'a+b/c=d e'],
      ['code_challenge', 'x_Y-z'],
      ['code_challenge_method', 'S256'],
      ['resource', 'https://qando.example/api/mcp'],
      ['exp', '1780000600'],
      ['ba_iat', '1780000000000'],
      ['ba_param', 'response_type'],
      ['ba_param', 'client_id'],
      ['ba_param', 'ba_param'],
      ['ba_pl', '1'],
      ['sig', 'a+b/c='],
    ]).toString();

    expect(parametersOf(askedAgain(signed))).toEqual([
      ['response_type', 'code'],
      ['client_id', 'https://claude.example/app.json'],
      ['redirect_uri', 'https://claude.example/back?from=qando&to=chat'],
      ['scope', 'events:read events:manage offline_access'],
      ['state', 'a+b/c=d e'],
      ['code_challenge', 'x_Y-z'],
      ['code_challenge_method', 'S256'],
      ['resource', 'https://qando.example/api/mcp'],
    ]);
  });

  it('keeps a parameter it does not know, and one sent twice, in their order', () => {
    expect(
      parametersOf(askedAgain('resource=a&client_id=c&resource=b&shown_as=dark&sig=s&exp=1')),
    ).toEqual([
      ['resource', 'a'],
      ['client_id', 'c'],
      ['resource', 'b'],
      ['shown_as', 'dark'],
    ]);
  });

  it.each([
    ['sig', 'signature=kept&sig=s', [['signature', 'kept']]],
    ['exp', 'expires=kept&exp=1', [['expires', 'kept']]],
    ['max_age', 'max_age_of=kept&max_age=0', [['max_age_of', 'kept']]],
    ['a ba_ parameter', 'iba_t=kept&ba=kept&ba_new=1', [['iba_t', 'kept'], ['ba', 'kept']]], // prettier-ignore
  ])('leaves out %s by its whole name only', (_, signed, asked) => {
    expect(parametersOf(askedAgain(signed))).toEqual(asked);
  });

  it('no longer asks for the sign-in the person has just made', () => {
    expect(parametersOf(askedAgain('client_id=c&prompt=login&max_age=0&state=s'))).toEqual([
      ['client_id', 'c'],
      ['state', 's'],
    ]);
  });

  it.each(['create', 'login create', 'create login'])(
    'no longer asks for the account the sign-in creates when there is none: "%s"',
    (prompt) => {
      const signed = new URLSearchParams({ client_id: 'c', prompt, state: 's' }).toString();

      expect(parametersOf(askedAgain(signed))).toEqual([
        ['client_id', 'c'],
        ['state', 's'],
      ]);
    },
  );

  it.each([
    ['login consent', 'consent'],
    ['consent login', 'consent'],
    ['create consent', 'consent'],
    ['login  consent  select_account', 'consent select_account'],
    ['consent', 'consent'],
    ['logins', 'logins'],
    ['created', 'created'],
  ])('of what it must ask the person, "%s", keeps "%s"', (prompt, kept) => {
    const signed = new URLSearchParams({ client_id: 'c', prompt }).toString();

    expect(parametersOf(askedAgain(signed))).toEqual([
      ['client_id', 'c'],
      ['prompt', kept],
    ]);
  });

  it('leaves every other parameter as it was sent, whatever it says', () => {
    const signed = new URLSearchParams([
      ['state', 'login'],
      ['login_hint', ''],
      ['scope', 'login  events:read'],
      ['sig', 's'],
    ]).toString();

    expect(parametersOf(askedAgain(signed))).toEqual([
      ['state', 'login'],
      ['login_hint', ''],
      ['scope', 'login  events:read'],
    ]);
  });

  it('answers nothing for a request that only carried what signed it', () => {
    expect(askedAgain('sig=s&exp=1&ba_iat=2')).toBe('');
  });
});
