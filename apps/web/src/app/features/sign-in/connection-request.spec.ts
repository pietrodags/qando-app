import { convertToParamMap } from '@angular/router';
import { connectionRequestOf } from './connection-request';

/** The parameters of a query, in order. */
const parametersOf = (query: string | undefined) => [...new URLSearchParams(query)];

describe('connectionRequestOf', () => {
  it('is the whole query of an address that carries a signed request, every value of each name', () => {
    const query = convertToParamMap({
      response_type: 'code',
      client_id: 'https://claude.example/app.json',
      scope: 'events:read events:manage',
      state: 'a+b/c=d&e',
      ba_param: ['response_type', 'client_id', 'ba_param'],
      exp: '1780000600',
      sig: 'a+b/c=',
    });

    expect(parametersOf(connectionRequestOf(query))).toEqual([
      ['response_type', 'code'],
      ['client_id', 'https://claude.example/app.json'],
      ['scope', 'events:read events:manage'],
      ['state', 'a+b/c=d&e'],
      ['ba_param', 'response_type'],
      ['ba_param', 'client_id'],
      ['ba_param', 'ba_param'],
      ['exp', '1780000600'],
      ['sig', 'a+b/c='],
    ]);
  });

  it('is none when the address carries no signature', () => {
    expect(connectionRequestOf(convertToParamMap({}))).toBeUndefined();
    expect(connectionRequestOf(convertToParamMap({ returnTo: '/vote/k3Jd9' }))).toBeUndefined();
    expect(
      connectionRequestOf(convertToParamMap({ client_id: 'c', signature: 's' })),
    ).toBeUndefined();
  });
});
