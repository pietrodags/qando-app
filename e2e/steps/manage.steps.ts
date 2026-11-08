import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { SeededEvent } from '@qando/api/seed';
import { createBdd } from 'playwright-bdd';
import { type ScenarioClock, type StoredEvents, test } from './fixtures.js';
import { expectNoVoting } from './vote.steps.js';

const { Given, When, Then } = createBdd(test);

/** "viernes 10 de julio", as the pages name a whole day. */
function longLabel(isoDate: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
    .format(Date.parse(isoDate))
    .replace(',', '');
}

/** The option of the latest event the pages name `label`: its ID and ISO date. */
function optionNamed(events: StoredEvents, label: string): { id: string; date: string } {
  const { seed, seeded } = events.get(events.latest.title);
  const dates = seed.options.map((option) => (typeof option === 'string' ? option : option.date));
  const index = dates.findIndex((date) => longLabel(date) === label);
  const id = seeded.optionIds[index];
  const date = dates[index];
  if (id === undefined || date === undefined) {
    throw new Error(`"${seed.title}" offers no option "${label}"`);
  }
  return { id, date };
}

// The management page.

/** Opens the management link, `/manage/:id#t=<token>`, as the organizer received it. */
async function openManagementLink(page: Page, event: SeededEvent): Promise<void> {
  await page.goto(`/manage/${event.publicId}#t=${event.managementToken}`);
}

/** Chooses the option named `label` (the first one when none is named) and confirms it. */
async function chooseAndConfirm(page: Page, label?: string): Promise<void> {
  // A recommended option's radio is also named by its "Más votada" badge.
  const radio =
    label === undefined
      ? page.getByRole('radio').first()
      : page.getByRole('radio', { name: new RegExp(`^${label}\\b`) });
  await radio.check();
  await page.getByRole('button', { name: 'Confirmar fecha', exact: true }).click();
}

/** The question asked before an unusual confirmation. */
function question(page: Page): Locator {
  return page.getByRole('dialog');
}

/**
 * The card of a confirmed date, as the management and participation pages show it: the heading
 * ("Fecha confirmada") and the date in full under it ("viernes 10 de julio de 2026").
 */
async function expectConfirmedCard(page: Page, heading: string, date: string): Promise<void> {
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect(page.locator('p.date')).toContainText(date);
}

/** "Fecha confirmada: viernes 10 de julio": the heading and the date. */
function confirmedParts(text: string): [heading: string, date: string] {
  const [heading = '', date = ''] = text.split(': ');
  return [heading, date];
}

When('I confirm {string} on the management page', async ({ page, events }, label: string) => {
  await openManagementLink(page, events.latest);
  await chooseAndConfirm(page, label);
  // The usual case: confirmed at once, no question asked.
  await expect(page.getByRole('heading', { name: 'Fecha confirmada', exact: true })).toBeVisible();
  await expect(question(page)).toHaveCount(0);
});

When(
  'I choose to confirm {string}( on the management page)',
  async ({ page, events }, label: string) => {
    await openManagementLink(page, events.latest);
    await chooseAndConfirm(page, label);
  },
);

When('I choose to confirm one of its options', async ({ page, events }) => {
  await openManagementLink(page, events.latest);
  await chooseAndConfirm(page);
});

Then('I am asked to confirm, with {string}', async ({ page }, text: string) => {
  await expect(question(page)).toBeVisible();
  await expect(question(page)).toContainText(text);
});

Then(
  'I am asked to confirm, with a note that it is not the recommended option',
  async ({ page }) => {
    await expect(question(page)).toBeVisible();
    await expect(question(page)).toContainText('No es la fecha más votada.');
  },
);

Then('I am asked to confirm, with a note that nobody has voted', async ({ page }) => {
  await expect(question(page)).toBeVisible();
  await expect(question(page)).toContainText('Nadie ha votado todavía.');
});

When('I accept', async ({ page }) => {
  await question(page).getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fecha confirmada', exact: true })).toBeVisible();
});

Then(
  'the management, results and participation pages show {string}',
  async ({ page, events }, text: string) => {
    const [heading, date] = confirmedParts(text);
    await expectConfirmedCard(page, heading, date);
    await page.goto(`/results/${events.latest.resultsId}`);
    await expect(page.locator('.confirmed')).toHaveText(text);
    await page.goto(`/vote/${events.latest.publicId}`);
    await expectConfirmedCard(page, heading, date);
  },
);

Then(
  'participants see {string} without counts and cannot vote',
  async ({ events, otherBrowsers }, text: string) => {
    const [heading, date] = confirmedParts(text);
    const participant = await otherBrowsers.page();
    await participant.goto(`/vote/${events.latest.publicId}`);
    await expectConfirmedCard(participant, heading, date);
    await expect(participant.locator('main')).not.toContainText(
      /\d+\s*(votos?|personas?|participantes?)/,
    );
    await expectNoVoting(participant);
  },
);

// The confirmation API, asked directly.

/** The headers of the scenario's requests: its client address and, once set, its time. */
function scenarioHeaders(address: string, clock: ScenarioClock, token: string) {
  const now = clock.now;
  return {
    'x-forwarded-for': address,
    'x-management-token': token,
    ...(now && { 'x-test-now': now.toISOString() }),
  };
}

interface Asker {
  readonly request: APIRequestContext;
  readonly address: string;
  readonly clock: ScenarioClock;
}

/** Asks the API to confirm `optionId` on `event` with `token`; answers the status. */
async function askToConfirm(
  { request, address, clock }: Asker,
  event: SeededEvent,
  token: string,
  optionId: string,
): Promise<number> {
  const answer = await request.post(`/api/events/${event.publicId}/confirmation`, {
    headers: scenarioHeaders(address, clock, token),
    data: { optionId },
  });
  return answer.status();
}

/** What the API stores of the event's outcome, read with its management token. */
async function outcomeOf(
  { request, address, clock }: Asker,
  event: SeededEvent,
): Promise<{ state: string; confirmedDate: string | null }> {
  const answer = await request.get(`/api/events/${event.publicId}`, {
    headers: scenarioHeaders(address, clock, event.managementToken),
  });
  expect(answer.status()).toBe(200);
  const { state, confirmedOption } = (await answer.json()) as {
    state: string;
    confirmedOption: { dates: { date?: string } } | null;
  };
  return { state, confirmedDate: confirmedOption?.dates.date ?? null };
}

Given(
  'I have confirmed {string}',
  async ({ request, address, clock, events, myConfirmation }, label: string) => {
    const option = optionNamed(events, label);
    const event = events.latest;
    const asker = { request, address, clock };
    expect(await askToConfirm(asker, event, event.managementToken, option.id)).toBe(200);
    myConfirmation.date = option.date;
  },
);

When(
  'the API is asked to confirm {string}',
  async ({ request, address, clock, events, apiAnswer }, label: string) => {
    const event = events.latest;
    const asker = { request, address, clock };
    const { id } = optionNamed(events, label);
    apiAnswer.status = await askToConfirm(asker, event, event.managementToken, id);
  },
);

When(
  'the API is asked to confirm an option of another event',
  async ({ request, address, clock, events, seeder, apiAnswer }) => {
    // Stored apart from the scenario's events: the later steps still mean the scenario's own.
    const other = await seeder.seed({
      title: 'Otro evento',
      options: ['2026-07-06'],
      deadline: '2026-07-01',
    });
    const otherOption = other.optionIds[0] ?? '';
    const event = events.latest;
    const asker = { request, address, clock };
    apiAnswer.status = await askToConfirm(asker, event, event.managementToken, otherOption);
  },
);

When(
  'someone asks the API to confirm {string} with the participation link',
  async ({ request, address, clock, events, apiAnswer }, label: string) => {
    const event = events.latest;
    const { id } = optionNamed(events, label);
    apiAnswer.status = await askToConfirm({ request, address, clock }, event, event.publicId, id);
  },
);

When(
  'someone asks the API to confirm {string} with the results link',
  async ({ request, address, clock, events, apiAnswer }, label: string) => {
    const event = events.latest;
    const { id } = optionNamed(events, label);
    apiAnswer.status = await askToConfirm({ request, address, clock }, event, event.resultsId, id);
  },
);

Then(
  'it answers {int} and the confirmed date is unchanged',
  async ({ request, address, clock, events, apiAnswer, myConfirmation }, status: number) => {
    expect(apiAnswer.status).toBe(status);
    const outcome = await outcomeOf({ request, address, clock }, events.latest);
    expect(outcome).toEqual({ state: 'confirmed', confirmedDate: myConfirmation.date });
  },
);

Then(
  'it answers {int} and nothing is confirmed',
  async ({ request, address, clock, events, apiAnswer }, status: number) => {
    expect(apiAnswer.status).toBe(status);
    const outcome = await outcomeOf({ request, address, clock }, events.latest);
    expect(outcome).toEqual({ state: 'open', confirmedDate: null });
  },
);
