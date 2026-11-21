// PROTOTYPE: walks, without a browser, the whole way an assistant follows to reach an organizer's
// events: the 401 challenge, discovery, registering itself, the request for access, signing in by
// email code (read from the local mailbox, never a real inbox), consent, the tokens, the MCP
// calls, a refresh, signing out of qando, and disconnecting.
//
//   node tools/mcp-spike/flow.mjs            (way "a": the sign-in itself continues the request)
//   SPIKE_WAY=b node tools/mcp-spike/flow.mjs (way "b": the request is opened again once signed in)
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const base = process.env.SPIKE_BASE ?? 'http://localhost:4200';
const mailbox = process.env.SPIKE_MAILBOX ?? 'http://127.0.0.1:2526';
const database = process.env.SPIKE_DATABASE ?? 'qando_mcp_spike';
const way = process.env.SPIKE_WAY ?? 'a';
const email = `spike-${Date.now()}@example.com`;
const redirectUri = 'http://127.0.0.1:53682/callback';

let steps = 0;
const done = (name, detail) => {
  steps += 1;
  console.log(
    `✓ ${String(steps).padStart(2)}. ${name}${detail === undefined ? '' : ` — ${detail}`}`,
  );
};
const stop = (name, detail) => {
  console.error(
    `✗ ${name}\n${typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)}`,
  );
  process.exit(1);
};

/** The browser's cookies, as the flow sets them. */
const jar = new Map();
const keep = (response) => {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0];
    const at = pair.indexOf('=');
    if (/max-age=0/i.test(cookie)) jar.delete(pair.slice(0, at));
    else jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
};
const cookies = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
const asPage = (extra = {}) => ({
  origin: base,
  ...(jar.size > 0 && { cookie: cookies() }),
  ...extra,
});
const json = { 'content-type': 'application/json' };

/** A JSON-RPC call to the MCP address, as a client of the 2025 revisions sends it. */
async function mcp(token, method, params, protocol = '2025-06-18') {
  const response = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: {
      ...json,
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': protocol,
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params && { params }) }),
  });
  const type = response.headers.get('content-type') ?? '';
  const text = await response.text();
  const body = type.includes('text/event-stream')
    ? JSON.parse(/^data: (.*)$/m.exec(text)?.[1] ?? 'null')
    : text && JSON.parse(text);
  return { response, type, body };
}

const claimsOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

// 1. Without a token: the challenge that starts everything.
const refused = await mcp(undefined, 'initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'spike', version: '0' },
});
const challenge = refused.response.headers.get('www-authenticate') ?? '';
const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
if (refused.response.status !== 401 || !metadataUrl) stop('401 challenge', challenge);
done('MCP without a token answers 401 with the challenge', challenge);

// 2. The protected address's document, then the authorization server's.
const resourceDoc = await (await fetch(metadataUrl)).json();
const issuer = resourceDoc.authorization_servers?.[0];
if (!issuer) stop('protected resource document', resourceDoc);
done('Protected resource document', `resource ${resourceDoc.resource}, server ${issuer}`);

const { origin, pathname } = new URL(issuer);
const server = await (
  await fetch(`${origin}/.well-known/oauth-authorization-server${pathname}`)
).json();
if (server.issuer !== issuer) stop('authorization server document', server);
done(
  'Authorization server document',
  `S256 ${server.code_challenge_methods_supported?.includes('S256')}, ` +
    `metadata documents ${server.client_id_metadata_document_supported}, ` +
    `"none" ${server.token_endpoint_auth_methods_supported?.includes('none')}, ` +
    `iss parameter ${server.authorization_response_iss_parameter_supported}`,
);

// 3. The application registers itself (the fallback when it has no metadata document).
const registered = await fetch(server.registration_endpoint, {
  method: 'POST',
  headers: json,
  body: JSON.stringify({
    client_name: 'Spike client',
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }),
});
const client = await registered.json();
if (!registered.ok || !client.client_id) stop('registration', client);
done('Registered itself', `client ${client.client_id}`);

// 4. The request for access, with PKCE.
const verifier = randomBytes(32).toString('base64url');
const state = randomBytes(8).toString('hex');
const request = new URLSearchParams({
  response_type: 'code',
  client_id: client.client_id,
  redirect_uri: redirectUri,
  scope: 'events:read events:manage offline_access',
  state,
  code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  code_challenge_method: 'S256',
  resource: resourceDoc.resource,
});
const authorizeUrl = `${server.authorization_endpoint}?${request}`;
/**
 * Opens an address as a browser's navigation does: Better Auth answers a navigation with a
 * redirect and a `fetch` (which Node's marks itself as) with the address in JSON.
 */
const navigate = async (url, headers = {}) => {
  const response = await fetch(url, {
    redirect: 'manual',
    headers: { 'sec-fetch-mode': 'navigate', accept: 'text/html', ...headers },
  });
  const location =
    response.headers.get('location') ?? (await response.json().catch(() => ({}))).url ?? '';
  return { status: response.status, location };
};
const toSignIn = await navigate(authorizeUrl);
const signInPage = new URL(toSignIn.location, base);
if (signInPage.pathname !== '/sign-in') {
  stop('authorize without a session', `${toSignIn.status} ${toSignIn.location}`);
}
const signedQuery = signInPage.search.slice(1);
done(
  'Request for access without a session goes to the sign-in page',
  `${toSignIn.status} ${signInPage.pathname}`,
);

// 5. Signing in by email code, through qando's own routes.
const sent = await fetch(`${base}/api/auth/sign-in-code`, {
  method: 'POST',
  headers: { ...json, ...asPage() },
  body: JSON.stringify({ email }),
});
if (!sent.ok) stop('sending the code', await sent.text());
const emails = await (await fetch(`${mailbox}/emails?to=${encodeURIComponent(email)}`)).json();
const code = /\b(\d{6})\b/.exec(emails.at(-1)?.text ?? '')?.[1];
if (!code) stop('reading the code from the mailbox', emails);

const signIn = await fetch(`${base}/api/auth/sign-in`, {
  method: 'POST',
  headers: { ...json, ...asPage() },
  body: JSON.stringify({
    email,
    code,
    name: 'Spike',
    ...(way === 'a' && { oauthQuery: signedQuery }),
  }),
});
keep(signIn);
const signedIn = await signIn.json();
if (!signIn.ok || jar.size === 0) stop('signing in', signedIn);
done(`Signed in by code (way ${way})`, JSON.stringify(signedIn).slice(0, 80));

// 6. On to the consent page.
let consentPage;
if (way === 'a') {
  if (!signedIn.continueTo) stop('way a: the sign-in did not answer where to continue', signedIn);
  consentPage = new URL(signedIn.continueTo, base);
} else {
  const again = await navigate(authorizeUrl, { cookie: cookies() });
  consentPage = new URL(again.location, base);
}
if (consentPage.pathname !== '/connect') stop('continuing to consent', consentPage.href);
done('The request continues to the consent page', consentPage.pathname);

const publicClient = await fetch(
  `${base}/api/auth/oauth2/public-client?client_id=${encodeURIComponent(client.client_id)}`,
  { headers: { cookie: cookies() } },
);
done('The consent page can read the application’s name', JSON.stringify(await publicClient.json()));

// 7. "Permitir".
const consent = await fetch(`${base}/api/auth/oauth2/consent`, {
  method: 'POST',
  headers: { ...json, ...asPage() },
  body: JSON.stringify({ accept: true, oauth_query: consentPage.search.slice(1) }),
});
const consented = await consent.json();
const back = new URL(consented.url ?? 'http://none');
if (!consent.ok || !back.href.startsWith(redirectUri) || back.searchParams.get('state') !== state) {
  stop('consent', consented);
}
done('Consent sends the browser back to the application', `iss ${back.searchParams.get('iss')}`);

// 8. The code for tokens.
const tokenOf = async (form) => {
  const response = await fetch(server.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  return { response, body: await response.json() };
};
const first = await tokenOf({
  grant_type: 'authorization_code',
  code: back.searchParams.get('code'),
  redirect_uri: redirectUri,
  client_id: client.client_id,
  code_verifier: verifier,
  resource: resourceDoc.resource,
});
if (!first.response.ok || !first.body.refresh_token) stop('token', first.body);
const claims = claimsOf(first.body.access_token);
done(
  'Tokens issued',
  `expires in ${first.body.expires_in} s, aud ${claims.aud}, scope "${claims.scope}", refresh token ${Boolean(first.body.refresh_token)}`,
);

// 9. The MCP calls.
const initialized = await mcp(first.body.access_token, 'initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'spike', version: '0' },
});
if (!initialized.body?.result) stop('initialize', initialized.body);
done(
  'initialize',
  `${initialized.response.status} ${initialized.type}, protocol ${initialized.body.result.protocolVersion}`,
);

const listed = await mcp(first.body.access_token, 'tools/list');
const tools = listed.body?.result?.tools ?? [];
if (tools.length !== 2) stop('tools/list', listed.body);
done(
  'tools/list',
  tools.map((tool) => `${tool.name} ${JSON.stringify(tool.annotations)}`).join(' | '),
);

const mine = await mcp(first.body.access_token, 'tools/call', {
  name: 'list_my_events',
  arguments: {},
});
if (!mine.body?.result || mine.body.result.isError) stop('list_my_events', mine.body);
done('list_my_events', mine.body.result.content[0].text);

const nothing = await mcp(first.body.access_token, 'tools/call', {
  name: 'spike_delete_nothing',
  arguments: {},
});
if (nothing.body?.result?.content?.[0]?.text !== 'ok') stop('spike_delete_nothing', nothing.body);
done('spike_delete_nothing', 'ok');

const modern = await mcp(first.body.access_token, 'tools/list', undefined, '2026-07-28');
console.log(
  `   (2026-07-28 revision, informative: ${modern.response.status} ${modern.type} ${JSON.stringify(modern.body).slice(0, 160)})`,
);

// 10. A refresh, then signing out of qando, then another refresh.
const second = await tokenOf({
  grant_type: 'refresh_token',
  refresh_token: first.body.refresh_token,
  client_id: client.client_id,
  resource: resourceDoc.resource,
});
if (!second.response.ok || !second.body.refresh_token) stop('refresh', second.body);
done(
  'Refresh',
  `new access token ${second.body.access_token !== first.body.access_token}, new refresh token ${second.body.refresh_token !== first.body.refresh_token}`,
);

const signedOut = await fetch(`${base}/api/auth/sign-out`, { method: 'POST', headers: asPage() });
if (!signedOut.ok) stop('sign-out', await signedOut.text());
const third = await tokenOf({
  grant_type: 'refresh_token',
  refresh_token: second.body.refresh_token,
  client_id: client.client_id,
  resource: resourceDoc.resource,
});
if (!third.response.ok || !third.body.refresh_token)
  stop('refresh after signing out of qando', third.body);
const stillMine = await mcp(third.body.access_token, 'tools/call', {
  name: 'list_my_events',
  arguments: {},
});
if (!stillMine.body?.result) stop('MCP after signing out of qando', stillMine.body);
done('Signing out of qando keeps the application connected', 'refresh and MCP call still work');

// 11. "Desconectar", by hand: the consent and the refresh tokens of this application go.
const sql =
  `delete from oauth_refresh_tokens where client_id = '${client.client_id}'; ` +
  `delete from oauth_consents where client_id = '${client.client_id}';`;
const deleted = spawnSync('psql', ['-h', 'localhost', '-d', database, '-Atc', sql], {
  encoding: 'utf8',
});
if (deleted.status !== 0) stop('deleting the grant', deleted.stderr);
const fourth = await tokenOf({
  grant_type: 'refresh_token',
  refresh_token: third.body.refresh_token,
  client_id: client.client_id,
  resource: resourceDoc.resource,
});
if (fourth.response.ok) stop('refresh after disconnecting should fail', fourth.body);
done(
  'After disconnecting, the refresh is refused',
  `${fourth.response.status} ${JSON.stringify(fourth.body)}`,
);
const lingering = await mcp(third.body.access_token, 'tools/list');
console.log(
  `   (the access token already issued still answers ${lingering.response.status} until it expires, at most 5 minutes)`,
);

console.log(`\nAll ${steps} steps passed (way ${way}).`);
