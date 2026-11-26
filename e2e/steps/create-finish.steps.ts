import { type Locator, type Page, expect } from '@playwright/test';
import { type DataTable, createBdd } from 'playwright-bdd';
import { type OptionRow, reachLastStep } from './create.steps.js';
import { day } from './dates-calendar.js';
import { type MyEvent, type OtherBrowsers, type ScenarioClock, test } from './fixtures.js';
import { pageHeaders } from './sign-in.steps.js';
import { currentStep } from './step-card.js';

const { Given, When, Then } = createBdd(test);

// The wizard's last step, "¡Hecho!" and the event it leaves: what participants are served through
// its participation link, and the links only its organizer has.

const createButton = (page: Page): Locator =>
  currentStep(page).getByRole('button', { name: 'Crear', exact: true });

const done = (page: Page): Locator => page.getByRole('heading', { name: '¡Hecho!', exact: true });

/** The link "¡Hecho!" gives to share, written without its scheme: "localhost:4200/vote/…". */
const sharedLink = (page: Page): Locator => page.getByText(/^\S+\/vote\/[\w-]+$/);

/** The participation ID of the event just created, read from the link "¡Hecho!" gives. */
async function createdId(page: Page): Promise<string> {
  const link = await sharedLink(page).innerText();
  return link.slice(link.lastIndexOf('/') + 1);
}

/** Walks the wizard to its last step with these options, and keeps what it was given. */
async function fillWizard(
  wizard: { page: Page; hasTouch: boolean },
  myEvent: MyEvent,
  title: string,
  rows: readonly OptionRow[],
  name?: string,
): Promise<void> {
  // A name of its own is typed by an account that may have events, whose last one proposes its name.
  await reachLastStep(wizard, title, rows, name, { nameProposed: name !== undefined });
  myEvent.title = title;
  myEvent.dates = [...new Set(rows.map((row) => row.dates))];
}

When(
  'I create the event {string} with the dates {string} and {string}',
  async ({ page, hasTouch, myEvent }, title: string, first: string, second: string) => {
    await fillWizard({ page, hasTouch }, myEvent, title, [{ dates: first }, { dates: second }]);
    await createButton(page).click();
  },
);

When(
  'I create the event {string} with the options:',
  async ({ page, hasTouch, myEvent }, title: string, table: DataTable) => {
    const rows = table.hashes().map(({ dates = '', time }) => ({
      dates,
      // A cell left empty is the whole day.
      ...(time && { time }),
    }));
    await fillWizard({ page, hasTouch }, myEvent, title, rows);
    await createButton(page).click();
  },
);

Given('I have chosen the date {string}', async ({ page, hasTouch, myEvent }, date: string) => {
  await fillWizard({ page, hasTouch }, myEvent, 'Cena de verano', [{ dates: date }]);
});

const noteField = (page: Page): Locator =>
  currentStep(page).getByLabel('Añade un comentario, si quieres.', { exact: true });

Given('I have written the note {string}', async ({ page, myEvent }, note: string) => {
  await noteField(page).fill(note);
  myEvent.note = note;
});

// The page a step opened an event on, when it was another browser's, or else the scenario's own.
When('I reload the page', async ({ page, events }) => {
  await (events.openedOn ?? page).reload();
});

Then('I see the "¡Hecho!" step with the participation link', async ({ page, baseURL }) => {
  await expect(done(page)).toBeVisible();
  // Only that card is left: no step of the wizard.
  await expect(currentStep(page)).toHaveCount(0);
  const host = new URL(baseURL ?? '').host;
  await expect(sharedLink(page)).toHaveText(new RegExp(`^${host}/vote/[A-Za-z0-9_-]{22}$`));
  await expect(page.getByRole('link', { name: 'Gestionar evento', exact: true })).toHaveAttribute(
    'href',
    `/manage/${await createdId(page)}`,
  );
});

// What participants are served.

/** An option as the participation link serves it. */
export interface ServedOption {
  readonly dates:
    | { readonly kind: 'single'; readonly date: string }
    | { readonly kind: 'range'; readonly start: string; readonly end: string };
  readonly time:
    | null
    | { readonly kind: 'single'; readonly at: string }
    | { readonly kind: 'range'; readonly start: string; readonly end: string };
}

/** What the steps read of an event as the participation link serves it. */
export interface ServedEvent {
  readonly title: string;
  readonly deadline: string;
  readonly options: readonly ServedOption[];
}

const shortDays = new Intl.DateTimeFormat('es', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "lun 6 jul". */
function shortDay(date: string): string {
  const parts = shortDays.formatToParts(Date.parse(date));
  const part = (type: string) => parts.find((each) => each.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}`;
}

/**
 * The options as the scenarios write them: "lun 6 jul", "lun 6 jul, 18:15", "lun 6 jul,
 * 20:00–22:00" and, in an event with times, "vie 10 jul, sin horario" for a whole day.
 */
function optionLabels(options: readonly ServedOption[]): string[] {
  const timed = options.some((option) => option.time !== null);
  return options.map(({ dates, time }) => {
    const days =
      dates.kind === 'single'
        ? shortDay(dates.date)
        : `${shortDay(dates.start)} – ${shortDay(dates.end)}`;
    if (time === null) return timed ? `${days}, sin horario` : days;
    return `${days}, ${time.kind === 'single' ? time.at : `${time.start}–${time.end}`}`;
  });
}

/**
 * Opens the participation link `/vote/:id` as a participant does, in a browser of their own (no
 * session), and answers that page and the event as the API serves it to that browser, asked with
 * `headers`: the options a participant votes on, whichever of the page's steps shows each.
 */
export async function openAsParticipant(
  id: string,
  otherBrowsers: OtherBrowsers,
  headers: Record<string, string>,
): Promise<{ page: Page; event: ServedEvent }> {
  const page = await otherBrowsers.page();
  await page.goto(`/vote/${id}`);
  // Asked apart from the page: the body of an answer the page got is gone once the page reloads.
  const answer = await page.request.get(`/api/public/events/${id}`, { headers });
  expect(answer.status()).toBe(200);
  const event = (await answer.json()) as ServedEvent;
  await expect(page.getByRole('heading', { name: event.title, exact: true })).toBeVisible();
  return { page, event };
}

async function expectServedOptions(
  id: string,
  otherBrowsers: OtherBrowsers,
  headers: Record<string, string>,
  table: DataTable,
): Promise<void> {
  const { event } = await openAsParticipant(id, otherBrowsers, headers);
  expect(optionLabels(event.options)).toEqual(table.hashes().map((row) => row.option));
}

Then(
  'the participation link shows the options:',
  async ({ page, otherBrowsers, baseURL, address, clock, events }, table: DataTable) => {
    const headers = pageHeaders(baseURL, address, clock);
    // The link of the stored event a step opened (its management page, its options editor), or
    // else the one "¡Hecho!" gives for the event just created.
    const id =
      events.opened === undefined
        ? await createdId(page)
        : events.get(events.opened).seeded.publicId;
    await expectServedOptions(id, otherBrowsers, headers, table);
  },
);

Then(
  'participants vote on exactly these {int} options, in this order:',
  async ({ page, otherBrowsers, baseURL, address, clock }, count: number, table: DataTable) => {
    expect(table.hashes()).toHaveLength(count);
    const headers = pageHeaders(baseURL, address, clock);
    await expectServedOptions(await createdId(page), otherBrowsers, headers, table);
  },
);

Then(
  'participants vote on {int} options',
  async ({ page, otherBrowsers, baseURL, address, clock }, count: number) => {
    const headers = pageHeaders(baseURL, address, clock);
    const { event } = await openAsParticipant(await createdId(page), otherBrowsers, headers);
    expect(event.options).toHaveLength(count);
  },
);

// The links only the organizer has, each opened in a browser without the organizer's session.
Then(
  'the event has a management link and a results link, both different from the participation link',
  async ({ page, otherBrowsers, myEvent, baseURL, address, clock }) => {
    const id = await createdId(page);
    // The organizer's browser keeps the management link's token, which "Gestionar evento" uses.
    const token = await page.evaluate(
      (key) => localStorage.getItem(key),
      `qando.managementToken.${id}`,
    );
    if (!token) throw new Error('The browser kept no management token');
    const other = await otherBrowsers.page();
    const headers = pageHeaders(baseURL, address, clock);
    const title = other.getByRole('heading', { name: myEvent.title, exact: true });
    await other.goto(`/manage/${id}#t=${token}`);
    await expect(title).toBeVisible();
    const managed = await other.request.get(`/api/events/${id}`, {
      headers: { ...headers, 'x-management-token': token },
    });
    expect(managed.status()).toBe(200);
    const { resultsId } = (await managed.json()) as { resultsId: string };
    expect(new Set([id, token, resultsId]).size).toBe(3);
    await other.goto(`/results/${resultsId}`);
    await expect(title).toBeVisible();
    const results = await other.request.get(`/api/results/${resultsId}`, { headers });
    expect(results.status()).toBe(200);
  },
);

// The event is in the database, not in the API's memory.

/** Creates the event in the wizard on two July dates, as `name`, and keeps what it serves. */
async function createInWizard(
  {
    page,
    hasTouch,
    myEvent,
    otherBrowsers,
    baseURL,
    address,
    clock,
  }: {
    page: Page;
    hasTouch: boolean;
    myEvent: MyEvent;
    otherBrowsers: OtherBrowsers;
    baseURL: string | undefined;
    address: string;
    clock: ScenarioClock;
  },
  title: string,
  name?: string,
): Promise<void> {
  const rows = [{ dates: '2026-07-06' }, { dates: '2026-07-10' }];
  await fillWizard({ page, hasTouch }, myEvent, title, rows, name);
  await createButton(page).click();
  await expect(done(page)).toBeVisible();
  const headers = pageHeaders(baseURL, address, clock);
  const { event } = await openAsParticipant(await createdId(page), otherBrowsers, headers);
  expect(event.options).toHaveLength(2);
  myEvent.served = event.options;
}

Given(
  'I have created the event {string}',
  async ({ page, hasTouch, myEvent, otherBrowsers, baseURL, address, clock }, title: string) => {
    const wizard = { page, hasTouch, myEvent, otherBrowsers, baseURL, address, clock };
    await createInWizard(wizard, title);
  },
);

Given(
  'I have created the event {string} in the wizard as {string}',
  async (
    { page, hasTouch, myEvent, otherBrowsers, baseURL, address, clock },
    title: string,
    name: string,
  ) => {
    const wizard = { page, hasTouch, myEvent, otherBrowsers, baseURL, address, clock };
    await createInWizard(wizard, title, name);
  },
);

When('the API restarts', async ({ restartedApi }) => {
  await restartedApi.start();
});

Then(
  'the participation link still shows {string} with its options',
  async (
    { page, otherBrowsers, restartedApi, baseURL, address, clock, myEvent },
    title: string,
  ) => {
    const id = await createdId(page);
    const participant = await otherBrowsers.page();
    await restartedApi.serve(participant, pageHeaders(baseURL, address, clock));
    await participant.goto(`/vote/${id}`);
    await expect(participant.getByRole('heading', { name: title, exact: true })).toBeVisible();
    // What the page showed came from the new process.
    const answer = restartedApi.answered.find(({ path }) => path === `/api/public/events/${id}`);
    expect(answer?.status).toBe(200);
    const event = JSON.parse(answer?.body ?? 'null') as ServedEvent;
    expect(event.title).toBe(title);
    expect(event.options).toEqual(myEvent.served);
  },
);

// The deadline.

/** The deadline's selects, a group named by its question. */
const deadlineField = (page: Page): Locator =>
  currentStep(page).getByRole('group', {
    name: '¿Hasta cuándo quieres que voten los participantes?',
  });

When('I set the deadline to {string}', async ({ page }, date: string) => {
  const [year = '', month = '', day = ''] = date.split('-');
  const selects = deadlineField(page);
  await selects.getByRole('combobox', { name: 'Año' }).selectOption(year);
  await selects.getByRole('combobox', { name: 'Mes' }).selectOption(String(Number(month)));
  await selects.getByRole('combobox', { name: 'Día' }).selectOption(String(Number(day)));
  await expect(selects.getByRole('combobox', { name: 'Día' })).toHaveValue(String(Number(day)));
  await expect(selects.getByRole('combobox', { name: 'Mes' })).toHaveValue(String(Number(month)));
  await expect(selects.getByRole('combobox', { name: 'Año' })).toHaveValue(year);
});

Then('I see a warning that the deadline is after the first date', async ({ page, myEvent }) => {
  const [first = ''] = myEvent.dates;
  const named = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
    .format(Date.parse(first))
    .replace(',', '');
  await expect(currentStep(page).getByRole('status')).toHaveText(
    `Ojo: la votación cierra después de la primera fecha, el ${named}.`,
  );
});

Then('I can still create the event', async ({ page, baseURL, address, clock }) => {
  await createButton(page).click();
  await expect(done(page)).toBeVisible();
  // Created with the deadline that warned, not with another one in its place.
  const answer = await page.request.get(`/api/public/events/${await createdId(page)}`, {
    headers: pageHeaders(baseURL, address, clock),
  });
  const event = (await answer.json()) as ServedEvent;
  const [first] = event.options;
  if (first?.dates.kind !== 'single') throw new Error('The event has no first date');
  expect(event.deadline > first.dates.date).toBe(true);
});

// A failure of the server.

Given('the API will fail the next request', async ({ page }) => {
  await page.route(
    '**/api/**',
    (route) =>
      route.fulfill({
        status: 500,
        json: { error: { code: 'INTERNAL_ERROR', message: 'Failed for the scenario' } },
      }),
    { times: 1 },
  );
});

// An answer lost on its way back (a tunnel, a timeout): the API stored the event, the page never
// heard of it.
Given(
  'the answer to the next "Crear" will be lost once the event is stored',
  async ({ page, baseURL, address, clock }) => {
    await page.route(
      '**/api/events',
      async (route) => {
        // A page's route runs before the context's, which names the scenario: name it here.
        const headers = { ...route.request().headers(), ...pageHeaders(baseURL, address, clock) };
        const stored = await route.fetch({ headers });
        expect(stored.status(), await stored.text()).toBe(201);
        await route.abort('failed');
      },
      { times: 1 },
    );
  },
);

When('I press "Crear"', async ({ page }) => {
  await createButton(page).click();
});

When('I press "Crear otro evento"', async ({ page }) => {
  await page.getByRole('button', { name: 'Crear otro evento', exact: true }).click();
});

When('I press "Reintentar"', async ({ page }) => {
  await currentStep(page).getByRole('button', { name: 'Reintentar', exact: true }).click();
});

Then('I own exactly one event', async ({ seeder, mailbox, mySession }) => {
  expect(await seeder.eventsOwnedBy(mailbox.addressOf(mySession.email))).toBe(1);
});

Then('I see an error with "Reintentar"', async ({ page }) => {
  await expect(currentStep(page).getByRole('alert')).toHaveText(
    'No se ha podido crear el evento. Inténtalo de nuevo.',
  );
  await expect(
    currentStep(page).getByRole('button', { name: 'Reintentar', exact: true }),
  ).toBeVisible();
});

Then('the wizard still holds everything I entered', async ({ page, myEvent }) => {
  // Still on its last step, which can be sent again.
  await expect(createButton(page)).toBeEnabled();
  await expect(deadlineField(page).getByRole('combobox', { name: 'Día' })).toBeEnabled();
  await expect(noteField(page)).toHaveValue(myEvent.note);
  const back = (step: number): Locator =>
    currentStep(page).getByRole('button', { name: `Volver al paso ${String(step)}`, exact: true });
  await back(2).click();
  for (const date of myEvent.dates) {
    await expect(day(page, date)).toHaveAttribute('aria-pressed', 'true');
  }
  await back(1).click();
  await expect(currentStep(page).getByLabel('Tu nombre')).toHaveValue('Ana');
  await expect(currentStep(page).getByLabel('¿Qué hay que organizar?')).toHaveValue(myEvent.title);
});
