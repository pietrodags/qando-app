import { describe, expect, it } from 'vitest';
import { exampleApplications } from './example-applications.js';

describe('the example applications of the acceptance tests', () => {
  it('publish, at any host under .example, the application its address names', async () => {
    const answer = await exampleApplications('https://a1b2.example/Claude.json');

    expect(answer.status).toBe(200);
    expect(answer.headers.get('Content-Type')).toBe('application/json');
    expect(await answer.json()).toEqual({
      client_id: 'https://a1b2.example/Claude.json',
      client_name: 'Claude',
      redirect_uris: ['https://a1b2.example/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });

  it('name each application after its own address', async () => {
    const answer = await exampleApplications('https://other.host.example/Otra-app_2.json');

    expect(await answer.json()).toMatchObject({
      client_id: 'https://other.host.example/Otra-app_2.json',
      client_name: 'Otra-app_2',
      redirect_uris: ['https://other.host.example/callback'],
    });
  });

  it.each([
    ['a URL', new URL('https://a1b2.example/Claude.json')],
    ['a request', new Request('https://a1b2.example/Claude.json')],
  ])('read the address of %s', async (_case, asked) => {
    const answer = await exampleApplications(asked);

    expect(await answer.json()).toMatchObject({ client_name: 'Claude' });
  });

  it.each([
    ['a real application’s', 'https://claude.ai/Claude.json'],
    ['one that only starts like .example', 'https://a1b2.example.com/Claude.json'],
    ['one that only ends like .example', 'https://a1b2example/Claude.json'],
    ['the bare name', 'https://example/Claude.json'],
    ['one without a name', 'https://a1b2.example/.json'],
    ['one that is no document', 'https://a1b2.example/callback'],
    ['one deeper than a name', 'https://a1b2.example/oauth/Claude.json'],
    ['one with more than a name', 'https://a1b2.example/Claude.json.txt'],
    ['one whose name is not plain', 'https://a1b2.example/Clau%20de.json'],
  ])('publish nothing at %s address', async (_case, address) => {
    const answer = await exampleApplications(address);

    expect(answer.status).toBe(404);
    expect(await answer.text()).toBe('');
  });
});
