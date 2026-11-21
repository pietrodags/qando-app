// PROTOTYPE: the same way as `flow.mjs`, with the pages in a real browser: the application's
// request opens qando's sign-in page, the person signs in by code (read from the local mailbox),
// the consent page asks, "Permitir" sends the browser back to the application, which gets its
// tokens and calls the MCP address. A second request, already allowed, skips both pages.
//
//   node tools/mcp-spike/browser-flow.mjs [folder for screenshots]
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const base = process.env.SPIKE_BASE ?? 'http://localhost:4200';
const mailbox = process.env.SPIKE_MAILBOX ?? 'http://127.0.0.1:2526';
const shots = process.argv[2];
const email = `spike-${Date.now()}@example.com`;
const redirectUri = process.env.SPIKE_REDIRECT ?? 'http://127.0.0.1:53682/callback';
/** An application that publishes its own metadata document (its address is its ID), if given. */
const published = process.env.SPIKE_CLIENT_ID;
const clientName = process.env.SPIKE_CLIENT_NAME ?? 'Asistente de prueba';

let steps = 0;
const done = (name, detail) => {
  steps += 1;
  console.log(
    `✓ ${String(steps).padStart(2)}. ${name}${detail === undefined ? '' : ` — ${detail}`}`,
  );
};

const issuer = `${base}/api/auth`;
const server = await (
  await fetch(`${base}/.well-known/oauth-authorization-server/api/auth`)
).json();
const client = published
  ? { client_id: published }
  : await (
      await fetch(server.registration_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Asistente de prueba',
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      })
    ).json();

const verifier = randomBytes(32).toString('base64url');
const requestFor = (state) =>
  `${server.authorization_endpoint}?${new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: redirectUri,
    scope: 'events:read events:manage offline_access',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: `${base}/api/mcp`,
  })}`;

const browser = await chromium.launch();
const page = await browser.newPage({ locale: 'es-ES', viewport: { width: 420, height: 760 } });
/** The application's own address, served here: where the browser comes back with the code. */
let cameBack;
const application = createServer((request, response) => {
  cameBack = new URL(request.url ?? '/', redirectUri);
  response
    .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    .end('<h1>De vuelta en la aplicación</h1>');
}).listen(53682);

try {
  await page.goto(requestFor('first'));
  await page.getByLabel('Tu email', { exact: true }).fill(email);
  done('The request opens the sign-in page', new URL(page.url()).pathname);
  await page.getByRole('button', { name: 'Enviar código', exact: true }).click();
  await page.getByRole('heading', { name: 'Escribe el código', exact: true }).waitFor();
  const emails = await (await fetch(`${mailbox}/emails?to=${encodeURIComponent(email)}`)).json();
  const code = /\b(\d{6})\b/.exec(emails.at(-1)?.text ?? '')?.[1];
  await page.getByLabel('Código', { exact: true }).fill(code);

  await page.getByRole('button', { name: 'Permitir', exact: true }).waitFor();
  done('Signing in continues to the consent page', new URL(page.url()).pathname);
  await page.getByText(clientName).waitFor();
  if (shots) await page.screenshot({ path: `${shots}/consent-bare.png`, fullPage: true });
  await page.getByRole('button', { name: 'Permitir', exact: true }).click();
  await page.getByRole('heading', { name: 'De vuelta en la aplicación' }).waitFor();
  if (
    cameBack.searchParams.get('state') !== 'first' ||
    cameBack.searchParams.get('iss') !== issuer
  ) {
    throw new Error(`Unexpected return: ${cameBack.href}`);
  }
  done('"Permitir" sends the browser back to the application with a code');

  const tokens = await (
    await fetch(server.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: cameBack.searchParams.get('code'),
        redirect_uri: redirectUri,
        client_id: client.client_id,
        code_verifier: verifier,
        resource: `${base}/api/mcp`,
      }),
    })
  ).json();
  const called = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      authorization: `Bearer ${tokens.access_token}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'list_my_events', arguments: {} },
    }),
  });
  const answer = await called.text();
  if (!called.ok || !answer.includes('events'))
    throw new Error(`MCP call: ${called.status} ${answer}`);
  done(
    'The application gets its tokens and calls list_my_events',
    answer.replace(/\s+/g, ' ').slice(0, 120),
  );

  // Already signed in and already allowed: neither page is shown.
  cameBack = undefined;
  await page.goto(requestFor('second'));
  await page.getByRole('heading', { name: 'De vuelta en la aplicación' }).waitFor();
  if (cameBack.searchParams.get('state') !== 'second' || !cameBack.searchParams.get('code')) {
    throw new Error(`Unexpected second return: ${cameBack.href}`);
  }
  done('A second request, signed in and already allowed, goes straight back to the application');

  // "Cancelar" from another application: back with the refusal.
  if (published) throw new Error('done');
  const other = await (
    await fetch(server.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Otra aplicación',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
      }),
    })
  ).json();
  cameBack = undefined;
  await page.goto(requestFor('third').replace(client.client_id, other.client_id));
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('heading', { name: 'De vuelta en la aplicación' }).waitFor();
  if (cameBack.searchParams.get('error') !== 'access_denied') {
    throw new Error(`Unexpected refusal: ${cameBack.href}`);
  }
  done('"Cancelar" sends the browser back with the refusal', cameBack.searchParams.get('error'));
  console.log(`\nAll ${steps} browser steps passed.`);
} catch (error) {
  if (error.message === 'done') {
    console.log(`\nAll ${steps} browser steps passed (published application).`);
    await browser.close();
    application.close();
    process.exit(0);
  }
  if (shots) await page.screenshot({ path: `${shots}/failure.png`, fullPage: true });
  console.error(`✗ after step ${steps}: ${error.message}\n  at ${page.url().slice(0, 200)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  application.close();
}
