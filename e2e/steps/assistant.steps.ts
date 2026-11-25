import { expect, type Page, type PlaywrightWorkerArgs } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import type { AccessClaims, Assistant } from '../assistants.js';
import type { Mailbox } from '../mailbox/mailbox.js';
import { test, type ScenarioClock } from './fixtures.js';
import { pageHeaders, signInThroughTheApi } from './sign-in.steps.js';

const { Given, When, Then } = createBdd(test);

// The metadata of the authorization server as an application read it, kept for the step that
// checks it.
let serverMetadata: Record<string, unknown> | undefined;

When("an application reads the metadata of qando's authorization server", async ({ page }) => {
  // As an application finds it, through the web's address: the connector's metadata names the
  // authorization server, whose own metadata is at the well-known address of its site, with
  // the server's path after it.
  const connector = await page.request.get('/.well-known/oauth-protected-resource/api/mcp');
  expect(connector.status()).toBe(200);
  const { authorization_servers: servers } = (await connector.json()) as {
    authorization_servers: string[];
  };
  const server = new URL(servers[0] ?? '');
  const answer = await page.request.get(
    `${server.origin}/.well-known/oauth-authorization-server${server.pathname}`,
  );
  expect(answer.status()).toBe(200);
  serverMetadata = (await answer.json()) as Record<string, unknown>;
});

Then('the metadata offers no address to register at', () => {
  expect(serverMetadata).toHaveProperty('issuer');
  expect(serverMetadata).not.toHaveProperty('registration_endpoint');
});

// Connecting: the application opens the browser with its request, as an assistant does when
// qando is added to it.

/** The pages the scenario's browser showed since an application last sent it with a request. */
const shownSince = new WeakMap<Page, string[]>();

When('{string} asks to connect to qando', async ({ page, assistants }, name: string) => {
  const shown: string[] = [];
  if (!shownSince.has(page)) {
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) shownSince.get(page)?.push(frame.url());
    });
  }
  shownSince.set(page, shown);
  await page.goto(assistants.named(name).request());
  // The authorization server sends the browser on: to one of qando's pages, or straight back.
  await page.waitForURL(({ pathname }) => !pathname.startsWith('/api/'));
});

Then(
  'the consent page names {string} and says it will see, create and manage my events',
  async ({ page, assistants, mailbox, mySignIn, mySession }, name: string) => {
    await expect(page).toHaveURL(({ pathname }) => pathname === '/connect');
    const consent = page.getByRole('main');
    await expect(
      consent.getByRole('heading', { name: `Conectar ${name} con qando`, exact: true, level: 1 }),
    ).toBeVisible();
    // Who asks (its name, and the host its document is published at) and for which account.
    const account = mailbox.addressOf(mySignIn.email || mySession.email);
    await expect(
      consent.getByText(
        `${name} (${assistants.named(name).host}) quiere usar tu cuenta ${account}.`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(consent.getByRole('listitem')).toHaveText([
      'Ver tus eventos y sus resultados',
      'Crear eventos y gestionarlos por ti (confirmar la fecha, por ejemplo)',
    ]);
    // One answer for everything: nothing to tick.
    await expect(consent.getByRole('checkbox')).toHaveCount(0);
    await expect(consent.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
    await expect(consent.getByRole('button', { name: 'Permitir', exact: true })).toBeVisible();
  },
);

Then('the consent page links to {string}', async ({ page }, name: string) => {
  const link = page.getByRole('main').getByRole('link', { name, exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/privacy');
});

// The consent page's two answers.
When(/^I press "(Permitir|Cancelar)"$/, async ({ page }, name: string) => {
  await page.getByRole('main').getByRole('button', { name, exact: true }).click();
  // Either answer sends the browser back to the application, whose page is then loaded.
  await page.waitForURL(({ pathname }) => pathname !== '/connect');
});

/** What reading an application's answer needs: the fixtures a step receives. */
interface Answering {
  readonly page: Page;
  readonly playwright: PlaywrightWorkerArgs['playwright'];
  readonly baseURL: string | undefined;
  readonly address: string;
}

/**
 * Waits until the browser is back in the application and reads what it came back with, as the
 * application's server does: from outside the browser, with none of its cookies.
 */
async function answerTo(
  { page, playwright, baseURL, address }: Answering,
  assistant: Assistant,
): Promise<{ readonly access: AccessClaims } | { readonly refused: string }> {
  await page.waitForURL((url) => assistant.isReturn(url.href));
  const client = await playwright.request.newContext({ ...(baseURL && { baseURL }) });
  try {
    return await assistant.answer(client, page.url(), address);
  } finally {
    await client.dispose();
  }
}

/** What allowing an application without a browser needs: the fixtures a step receives. */
interface Allowing extends Answering {
  readonly clock: ScenarioClock;
  readonly mailbox: Mailbox;
}

/**
 * Connects the application to the account of `email` before the scenario's own steps, as the
 * pages do but without a browser: a session of its own asks, allows, and is sent back.
 */
async function allowed(
  { playwright, baseURL, address, clock, mailbox }: Allowing,
  assistant: Assistant,
  email: string,
): Promise<{ readonly access: AccessClaims } | { readonly refused: string }> {
  const headers = pageHeaders(baseURL, address, clock);
  const client = await playwright.request.newContext({ baseURL: headers.origin });
  try {
    // Signed in an hour before the scenario's own time, where it has one: the code the scenario
    // then asks for, to sign its browser in, is not one too many for the same email.
    const before = clock.now && new Date(clock.now.getTime() - 3_600_000).toISOString();
    await signInThroughTheApi(
      client,
      { ...headers, ...(before && { 'x-test-now': before }) },
      mailbox,
      email,
    );
    const asked = await client.get(assistant.request(), { headers, maxRedirects: 0 });
    expect(asked.status()).toBe(302);
    const consentPage = new URL(asked.headers().location ?? '', headers.origin);
    expect(consentPage.pathname).toBe('/connect');
    const answered = await client.post('/api/auth/oauth2/consent', {
      headers,
      data: { accept: true, oauth_query: consentPage.search.slice(1) },
    });
    expect(answered.status()).toBe(200);
    const { url } = (await answered.json()) as { url: string };
    // The application's own server reads the answer: no cookie of the session that allowed it.
    const application = await playwright.request.newContext({ baseURL: headers.origin });
    try {
      return await assistant.answer(application, url, address);
    } finally {
      await application.dispose();
    }
  } finally {
    await client.dispose();
  }
}

/** The access the application was given is the account's, for the connector. */
function expectAccessTo(
  answer: { readonly access: AccessClaims } | { readonly refused: string },
  assistant: Assistant,
  accountId: string | null,
): void {
  if ('refused' in answer) throw new Error(`${assistant.name} was refused: ${answer.refused}`);
  expect(accountId).not.toBeNull();
  expect(answer.access.sub).toBe(accountId);
  expect(answer.access.aud).toBe(assistant.connector);
}

Given(
  '{string} is connected to the account of {string}',
  async (
    { page, playwright, baseURL, address, clock, mailbox, seeder, assistants },
    name: string,
    email: string,
  ) => {
    const assistant = assistants.named(name);
    // After the application sent the browser with its request, the answer the browser comes back
    // with; with no request waiting, the connection is made here, before the scenario's steps.
    const answer = assistant.waits
      ? await answerTo({ page, playwright, baseURL, address }, assistant)
      : await allowed({ page, playwright, baseURL, address, clock, mailbox }, assistant, email);
    expectAccessTo(answer, assistant, await seeder.accountId(mailbox.addressOf(email)));
  },
);

Then(
  '{string} is connected to the account of {string} without the consent page',
  async (
    { page, playwright, baseURL, address, mailbox, seeder, assistants },
    name: string,
    email: string,
  ) => {
    const assistant = assistants.named(name);
    const answer = await answerTo({ page, playwright, baseURL, address }, assistant);
    expectAccessTo(answer, assistant, await seeder.accountId(mailbox.addressOf(email)));
    // The browser went from the request straight back to the application.
    const shown = (shownSince.get(page) ?? []).map((address) => new URL(address).pathname);
    expect(shown).not.toContain('/connect');
    expect(shown).not.toContain('/sign-in');
  },
);

Then(
  '{string} is told that access was denied',
  async ({ page, playwright, baseURL, address, assistants }, name: string) => {
    const answer = await answerTo({ page, playwright, baseURL, address }, assistants.named(name));
    expect(answer).toEqual({ refused: 'access_denied' });
  },
);
