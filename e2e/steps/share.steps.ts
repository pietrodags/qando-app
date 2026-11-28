// Sharing an event's links: the participation link from "¡Hecho!", the event just created, and
// both links, to vote and to the results, from the management page's "Enlaces".
import { type Locator, type Page, expect } from '@playwright/test';
import type { SeededEvent } from '@qando/api/seed';
import { createBdd } from 'playwright-bdd';
import { type StoredEvents, test } from './fixtures.js';
import { openSection, sectionBody } from './manage.steps.js';

const { When, Then } = createBdd(test);

/** The whole participation link of the event just created, by the ID its "Gestionar evento" opens. */
async function participationLink(page: Page, baseURL: string | undefined): Promise<string> {
  const manage = page.getByRole('link', { name: 'Gestionar evento', exact: true });
  const id = (await manage.getAttribute('href'))?.split('/').pop() ?? '';
  return `${new URL(baseURL ?? '').origin}/vote/${id}`;
}

/** That "Compartir" is there, and that WhatsApp, Telegram and email share `link` with `text`. */
async function expectShared(scope: Page | Locator, link: string, text: string): Promise<void> {
  await expect(scope.getByRole('button', { name: 'Compartir', exact: true })).toBeVisible();
  for (const channel of ['WhatsApp', 'Telegram', 'Email']) {
    const href = await scope.getByRole('link', { name: channel, exact: true }).getAttribute('href');
    expect(href, channel).toContain(encodeURIComponent(text));
    expect(href, channel).toContain(encodeURIComponent(link));
  }
}

/** A link of the management page's "Enlaces": the name its well shows and its path. */
interface ManagedLink {
  readonly name: string;
  readonly path: (event: SeededEvent) => string;
}

/** The management page's links, by the word the steps use for each. */
const MANAGED_LINKS: Readonly<Record<string, ManagedLink>> = {
  voting: { name: 'Para votar', path: (event) => `/vote/${event.publicId}` },
  results: { name: 'Resultados', path: (event) => `/results/${event.resultsId}` },
};

/** The link a step's word means; a word with no link fails the step. */
function managed(kind: string): ManagedLink {
  const link = MANAGED_LINKS[kind];
  if (link === undefined) throw new Error(`"Enlaces" has no ${kind} link`);
  return link;
}

/** A link of "Enlaces", the section opened if closed: its well and the share block under it. */
async function managedLink(page: Page, kind: string): Promise<Locator> {
  const { name } = managed(kind);
  await openSection(page, 'Enlaces');
  const links = await sectionBody(page, 'Enlaces');
  return links.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) });
}

/** The whole link of `kind` of the event `title`, as its management page shares it. */
function eventLink(
  events: StoredEvents,
  title: string,
  kind: string,
  baseURL: string | undefined,
): string {
  return `${new URL(baseURL ?? '').origin}${managed(kind).path(events.get(title).seeded)}`;
}

Then(
  'WhatsApp, Telegram and email share the participation link with {string}',
  async ({ page, baseURL }, text: string) => {
    await expectShared(page, await participationLink(page, baseURL), text);
  },
);

Then(
  'WhatsApp, Telegram and email share the {word} link of {string} with {string}',
  async ({ page, events, baseURL }, kind: string, title: string, text: string) => {
    await expectShared(
      await managedLink(page, kind),
      eventLink(events, title, kind, baseURL),
      text,
    );
  },
);

When('I press "Copiar enlace"', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copiar enlace', exact: true }).click();
});

When('I press "Copiar enlace" under the {word} link', async ({ page }, kind: string) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const link = await managedLink(page, kind);
  await link.getByRole('button', { name: 'Copiar enlace', exact: true }).click();
});

Then(
  'the participation link is in the clipboard and I see {string}',
  async ({ page, baseURL }, told: string) => {
    await expect(page.getByText(told, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await participationLink(page, baseURL),
    );
  },
);

Then(
  'the {word} link of {string} is in the clipboard and I see {string}',
  async ({ page, events, baseURL }, kind: string, title: string, told: string) => {
    await expect(page.getByText(told, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      eventLink(events, title, kind, baseURL),
    );
  },
);
