import type { AuthDependencies } from './auth.js';

/** `https://<a host under .example>/<a plain name>.json`, and the name. */
const published = /^https:\/\/[^/]+\.example\/([\w-]+)\.json$/;

/**
 * The applications of the acceptance tests, published without a network (given to `createAuth`
 * as its `fetchApplicationDocument`): the address `https://<host>.example/<name>.json` answers
 * the document of an application named `<name>`, which asks the browser back at
 * `https://<host>.example/callback` and proves itself with nothing, as Claude does. Any other
 * address answers `404`, so nothing leaves the computer. `.example` is reserved and belongs to
 * nobody: no real application is ever answered here. Only an API started under
 * `QANDO_TEST_APPLICATIONS=on` reads documents this way (main.ts); a deployed one never does.
 */
export const exampleApplications: NonNullable<AuthDependencies['fetchApplicationDocument']> = (
  input: string | URL | Request,
) => {
  const address = new URL(input instanceof Request ? input.url : input);
  const name = published.exec(address.href)?.[1];
  if (name === undefined) return Promise.resolve(new Response(null, { status: 404 }));
  return Promise.resolve(
    new Response(
      JSON.stringify({
        client_id: address.href,
        client_name: name,
        redirect_uris: [`${address.origin}/callback`],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );
};
