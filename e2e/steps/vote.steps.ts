import { randomBytes } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { localInstant } from './clock.steps.js';
import { type MyVote, type StoredEvents, test } from './fixtures.js';

const { Given, When, Then } = createBdd(test);

type Answer = 'available' | 'preferred' | 'unavailable';

const ANSWER_NAMES: Record<Answer, string> = {
  available: 'Disponible',
  preferred: 'Preferido',
  unavailable: 'No puedo',
};

/** "lunes, 6 de julio", as the calendar names its days. */
function dayName(isoDate: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(Date.parse(isoDate));
}

/**
 * The step on screen: the only region named after its step ("paso 2"). The steps above it (tabs)
 * and a step folding away (still on screen, inert, for a moment) are not regions, so a button
 * looked up here is never one of theirs.
 */
function card(page: Page): Locator {
  return page.getByRole('region', { name: /^paso \d+$/ });
}

function day(page: Page, isoDate: string) {
  return card(page).getByRole('button', { name: new RegExp(`^${dayName(isoDate)}:`) });
}

/**
 * How the calendar names a day (`2026-07-06`), or the chip of a range among options that overlap
 * (`2026-07-07..2026-07-10`: "martes, 7 de julio – viernes, 10 de julio").
 */
function choiceName(dates: string): string {
  return dates.split('..').map(dayName).join(' – ');
}

/**
 * Marks a day, or the chip of an overlapping range, with a mouse: a click toggles available ↔
 * unavailable, a double-click prefers.
 */
async function mark(page: Page, dates: string, answer: Answer): Promise<void> {
  if ((await card(page).getAttribute('aria-label')) === 'paso 1') {
    await card(page).getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
  }
  const name = choiceName(dates);
  const target = card(page).getByRole('button', { name: new RegExp(`^${name}:`) });
  const modal = await openOverlaps(page, dates, target);
  if (answer === 'preferred') {
    await target.dblclick();
  } else {
    // A click turns the preferred day available, then toggles: at most two clicks, each one
    // waited for, so the next read sees the answer it left.
    const current = await target.getAttribute('aria-label');
    let state = (Object.keys(ANSWER_NAMES) as Answer[]).find((candidate) =>
      current?.endsWith(`: ${ANSWER_NAMES[candidate]}`),
    );
    while (state !== answer) {
      state = state === 'available' ? 'unavailable' : 'available';
      await target.click();
      await expect(target).toHaveAccessibleName(`${name}: ${ANSWER_NAMES[state]}`);
    }
  }
  await expect(target).toHaveAccessibleName(`${name}: ${ANSWER_NAMES[answer]}`);
  if (modal) {
    await modal.getByRole('button', { name: 'Listo' }).click();
    await expect(modal).toBeHidden();
  }
}

/**
 * On a phone the chips of overlapping ranges are in a modal, which a tap on a day of the overlap
 * opens: opens it when the chip is not on screen, and answers the modal (or null on a wider
 * screen, where the chips are under the calendar).
 */
async function openOverlaps(page: Page, dates: string, chip: Locator): Promise<Locator | null> {
  if (!dates.includes('..')) return null;
  const [start = ''] = dates.split('..');
  const opener = card(page).getByRole('button', {
    name: `${dayName(start)}: Fechas que se solapan`,
  });
  await expect(chip.or(opener).first()).toBeVisible();
  if (await chip.isVisible()) return null;
  await opener.click();
  const modal = page.getByRole('dialog', { name: 'Fechas que se solapan' });
  await expect(chip).toBeVisible();
  return modal;
}

function votingChoices(page: Page) {
  return [
    page.getByRole('button', { name: 'Me adapto a lo que elija la mayoría…' }),
    page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }),
  ];
}

async function typeName(page: Page, name: string): Promise<void> {
  await page.getByLabel('Escribe tu nombre para votar').fill(name);
}

When(
  'I open the participation link and type the name {string}',
  async ({ page, events }, name: string) => {
    await page.goto(`/vote/${events.latest.publicId}`);
    await typeName(page, name);
  },
);

When('I type the name {string}', async ({ page }, name: string) => {
  await typeName(page, name);
});

Then('the voting choices are disabled', async ({ page }) => {
  for (const choice of votingChoices(page)) await expect(choice).toBeDisabled();
});

Then('the voting choices are enabled', async ({ page }) => {
  for (const choice of votingChoices(page)) await expect(choice).toBeEnabled();
});

When('I mark {string} as preferred', async ({ page }, date: string) => {
  await mark(page, date, 'preferred');
});

When(
  'I mark {string} as available, {string} as preferred and {string} as unavailable',
  async ({ page }, available: string, preferred: string, unavailable: string) => {
    await mark(page, available, 'available');
    await mark(page, preferred, 'preferred');
    await mark(page, unavailable, 'unavailable');
  },
);

When(
  'I mark {string} as preferred and {string} as unavailable',
  async ({ page }, preferred: string, unavailable: string) => {
    await mark(page, preferred, 'preferred');
    await mark(page, unavailable, 'unavailable');
  },
);

Then(
  'the results of {string} show {string} preferring the first range and not available on the second',
  async ({ events }, title: string, name: string) => {
    expect(await events.votesOf(title)).toEqual([{ name, states: ['preferred', 'unavailable'] }]);
  },
);

/** From the last step, after its check: the overlay that sends the vote. */
function sendButton(page: Page) {
  return card(page).getByRole('button', { name: 'Confirmar mi voto' });
}

async function openConfirmation(page: Page): Promise<void> {
  await card(page).getByRole('button', { name: 'Confirmar mis días' }).click();
  await expect(sendButton(page)).toBeVisible();
}

When('I confirm my vote', async ({ page }) => {
  await openConfirmation(page);
  await sendButton(page).click();
});

/** Opens the participation link as "Luis" and gets to the confirmation of his days. */
async function readyToSend(page: Page, publicId: string): Promise<void> {
  await page.goto(`/vote/${publicId}`);
  await typeName(page, 'Luis');
  await card(page).getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
  await openConfirmation(page);
}

When('I confirm my vote twice in a row', async ({ page, events }) => {
  await readyToSend(page, events.latest.publicId);
  await sendButton(page).dblclick();
  await expect(page.getByRole('heading', { name: '¡Hecho!' })).toBeVisible();
});

When(
  'I confirm my vote in two tabs of the same browser at once',
  async ({ page, context, clock, events }) => {
    const other = await context.newPage();
    await clock.follow(other);
    const tabs = [page, other];
    for (const tab of tabs) await readyToSend(tab, events.latest.publicId);

    await Promise.all(tabs.map((tab) => sendButton(tab).click()));

    for (const tab of tabs) {
      await expect(tab.getByRole('heading', { name: '¡Hecho!' })).toBeVisible();
    }
  },
);

Then(
  'I see the thank-you screen with a private {string} link',
  async ({ page, events }, name: string) => {
    await expect(page.getByRole('heading', { name: '¡Hecho!' })).toBeVisible();
    const link = page.getByRole('link', { name });
    await expect(link).toHaveAttribute(
      'href',
      new RegExp(`/vote/${events.latest.publicId}/my-vote#t=[A-Za-z0-9_-]{22,64}$`),
    );
  },
);

Then(
  'the results of {string} show {string} available on 6 and 10 July, preferring 10 July',
  async ({ events }, title: string, name: string) => {
    // The event's options are 6, 10 and 11 July (Background).
    expect(await events.votesOf(title)).toEqual([
      { name, states: ['available', 'preferred', 'unavailable'] },
    ]);
  },
);

Then('the results count {int} voter(s)', async ({ events }, count: number) => {
  expect(await events.votesOf(events.latest.title)).toHaveLength(count);
});

Then(
  'only {string} is preferred and {string} is available',
  async ({ page }, preferred: string, available: string) => {
    await expect(day(page, preferred)).toHaveAccessibleName(`${dayName(preferred)}: Preferido`);
    await expect(day(page, available)).toHaveAccessibleName(`${dayName(available)}: Disponible`);
    await expect(card(page).getByRole('button', { name: /: Preferido$/ })).toHaveCount(1);
  },
);

/** The ISO dates of the latest event's options, in order. */
function optionDates(events: StoredEvents): string[] {
  const { seed } = events.get(events.latest.title);
  return seed.options.map((option) => (typeof option === 'string' ? option : option.date));
}

/** Votes through the page as `name` with `answers`, and keeps what the thank-you screen gives. */
async function vote(
  page: Page,
  events: StoredEvents,
  myVote: MyVote,
  name: string,
  answers: Record<string, Answer>,
): Promise<void> {
  await page.goto(`/vote/${events.latest.publicId}`);
  await typeName(page, name);
  for (const [date, answer] of Object.entries(answers)) await mark(page, date, answer);
  await openConfirmation(page);
  await sendButton(page).click();
  const link = page.getByRole('link', { name: 'Editar mi voto' });
  Object.assign(myVote, { name, answers, link: (await link.getAttribute('href')) ?? '', page });
}

Given(
  'I have voted as {string} with {string} available',
  async ({ page, events, myVote }, name: string, date: string) => {
    // That day available and the others unavailable: answers a new vote would not start from.
    const answers = Object.fromEntries(
      optionDates(events).map((option) => [option, option === date ? 'available' : 'unavailable']),
    ) as Record<string, Answer>;
    await vote(page, events, myVote, name, answers);
  },
);

Given('I have voted as {string}', async ({ page, events, myVote }, name: string) => {
  // The answers of the first scenario: one of each, none the answer a new vote starts from alone.
  const answers: Answer[] = ['available', 'preferred', 'unavailable'];
  const dates = optionDates(events);
  await vote(
    page,
    events,
    myVote,
    name,
    Object.fromEntries(dates.map((date, index) => [date, answers[index] ?? 'available'])),
  );
});

When('I open the participation link again in the same browser', async ({ events, myVote }) => {
  await myVote.page.goto(`/vote/${events.latest.publicId}`);
});

When(
  'I open my {string} link in another browser',
  async ({ otherBrowsers, myVote }, name: string) => {
    expect(name).toBe('Editar mi voto');
    const page = await otherBrowsers.page();
    await page.goto(myVote.link);
    myVote.page = page;
  },
);

Then('I see my previous answers', async ({ myVote }) => {
  const page = myVote.page;
  await expect(page.getByText('Ya has votado.')).toBeVisible();
  await expect(page.getByLabel('Escribe tu nombre para votar')).toHaveValue(myVote.name);
  await card(page).getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
  for (const [date, answer] of Object.entries(myVote.answers)) {
    await expect(day(page, date)).toHaveAccessibleName(
      `${dayName(date)}: ${ANSWER_NAMES[answer as Answer]}`,
    );
  }
});

When('I mark {string} as unavailable and confirm', async ({ myVote }, date: string) => {
  const page = myVote.page;
  await mark(page, date, 'unavailable');
  await openConfirmation(page);
  await sendButton(page).click();
  await expect(page.getByText('Tu voto ha sido actualizado correctamente.')).toBeVisible();
});

Then(
  'the results count 1 voter and {string} is unavailable on 6 July',
  async ({ events }, name: string) => {
    const votes = await events.votesOf(events.latest.title);
    expect(votes).toHaveLength(1);
    // 6 July is the event's first option (Background).
    expect(votes[0]?.name).toBe(name);
    expect(votes[0]?.states[0]).toBe('unavailable');
  },
);

/** A time block of step 3: "lunes, 6 de julio, 19:30 a 21:00: Disponible". */
function timeBlock(page: Page, isoDate: string, time: string) {
  return card(page).getByRole('button', { name: new RegExp(`^${dayName(isoDate)}, ${time}:`) });
}

When(
  'I mark the day {string} as unavailable and go on to the times',
  async ({ page }, date: string) => {
    await mark(page, date, 'unavailable');
    await card(page).getByRole('button', { name: 'Elegir las horas' }).click();
  },
);

Then('I see only the times of {string}', async ({ page }, date: string) => {
  await expect(card(page)).toHaveAccessibleName('paso 3');
  const blocks = card(page).getByRole('button', { name: /: (Disponible|Preferido|No puedo)$/ });
  await expect(blocks.first()).toBeVisible();
  for (const block of await blocks.all()) {
    await expect(block).toHaveAccessibleName(new RegExp(`^${dayName(date)}, `));
  }
});

When('I mark {string} on {string} as preferred', async ({ page }, time: string, date: string) => {
  const block = timeBlock(page, date, time);
  await block.dblclick();
  await expect(block).toHaveAccessibleName(`${dayName(date)}, ${time}: Preferido`);
});

When('I confirm my times and send my vote', async ({ page }) => {
  await card(page).getByRole('button', { name: 'Confirmar mis horas' }).click();
  await sendButton(page).click();
  await expect(page.getByRole('heading', { name: '¡Hecho!' })).toBeVisible();
});

Then(
  'the results of {string} show {string} available at 18:00 on 6 July, preferring 19:30 to 21:00 and not on 8 July',
  async ({ events }, title: string, name: string) => {
    // The event's options are 6 July 18:00, 6 July 19:30–21:00 and 8 July 18:00 (scenario).
    expect(await events.votesOf(title)).toEqual([
      { name, states: ['available', 'preferred', 'unavailable'] },
    ]);
  },
);

// The states of a page where voting has ended: closed, confirmed, cancelled, unknown link.

When('I open the participation link', async ({ page, events }) => {
  await page.goto(`/vote/${events.latest.publicId}`);
});

When('I open a participation link of an event that does not exist', async ({ page }) => {
  // The shape of a participation ID, which no stored event has.
  await page.goto(`/vote/${'x'.repeat(22)}`);
});

Given(
  'I have opened the participation link on {string} at {word}',
  async ({ page, events, clock }, date: string, time: string) => {
    await clock.set(localInstant(date, time, 'Europe/Madrid'));
    await readyToSend(page, events.latest.publicId);
  },
);

When(
  'I confirm my vote at {word} on {string}',
  async ({ page, clock }, time: string, date: string) => {
    await clock.set(localInstant(date, time, 'Europe/Madrid'));
    await sendButton(page).click();
  },
);

Then('the vote is not stored', async ({ events }) => {
  expect(await events.votesOf(events.latest.title)).toHaveLength(0);
});

/** Nothing on the page lets the voter vote: no first-step choices, no days, no send. */
export async function expectNoVoting(page: Page): Promise<void> {
  for (const choice of votingChoices(page)) await expect(choice).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /: (Disponible|Preferido|No puedo)$/ }),
  ).toHaveCount(0);
  await expect(sendButton(page)).toHaveCount(0);
}

async function expectTexts(page: Page, texts: readonly string[]): Promise<void> {
  for (const text of texts) await expect(page.getByText(text, { exact: true })).toBeVisible();
}

Then('I see {string} and no options to vote', async ({ page }, heading: string) => {
  await expectTexts(page, [heading]);
  await expectNoVoting(page);
});

Then('I see {string} and {string}', async ({ myVote }, first: string, second: string) => {
  // The page the scenario voted from, or the first page when it did not vote.
  await expectTexts(myVote.page, [first, second]);
});

Then(
  'I see {string} and {string} without any counts',
  async ({ page }, first: string, second: string) => {
    await expectTexts(page, [first, second]);
    await expect(page.locator('main')).not.toContainText(/\d+\s*(votos?|personas?|participantes?)/);
  },
);

Then('I cannot vote', async ({ page }) => {
  await expectNoVoting(page);
});

Then('I am not offered to try again', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
});

// Anonymous events: the page never asks for a name and the vote stores none.

When('I vote on it', async ({ page, events, myVote }) => {
  await page.goto(`/vote/${events.latest.publicId}`);
  const choose = card(page).getByRole('button', { name: 'Quiero elegir mis preferencias…' });
  // The first step is on screen (its choices enabled without a name) before the name field is
  // looked for, so a field still loading is not taken for one that is absent.
  await expect(choose).toBeEnabled();
  myVote.askedForName = (await page.getByLabel('Escribe tu nombre para votar').count()) > 0;
  await choose.click();
  await openConfirmation(page);
  await sendButton(page).click();
  await expect(page.getByRole('heading', { name: '¡Hecho!' })).toBeVisible();
});

Then('I was not asked for a name', ({ myVote }) => {
  expect(myVote.askedForName).toBe(false);
});

Then('the API stores no name for my vote', async ({ events }) => {
  // The event's only option, available by default; a stored name would show as `name`.
  expect(await events.votesOf(events.latest.title)).toEqual([{ states: ['available'] }]);
});

// Votes sent to the API directly, as no page would send them.

/** The states of a vote that breaks one rule, by option ID. */
async function brokenVotes(events: StoredEvents, problem: string): Promise<Record<string, string>> {
  const [first = '', second = '', third = ''] = events.get('Cena de verano').seeded.optionIds;
  const valid = { [first]: 'available', [second]: 'preferred', [third]: 'unavailable' };
  switch (problem) {
    case 'an option from another event': {
      const other = await events.store({
        title: 'Otro evento',
        options: ['2026-07-20'],
        deadline: '2026-07-01',
      });
      return { ...valid, [other.optionIds[0] ?? '']: 'available' };
    }
    case 'an option of the event missing':
      return { [first]: 'available', [second]: 'preferred' };
    case 'an unknown state':
      return { ...valid, [third]: 'maybe' };
    case 'two preferred options':
      return { ...valid, [first]: 'preferred' };
    default:
      throw new Error(`No vote breaks the rule "${problem}"`);
  }
}

When(
  'the API receives a vote with {}',
  async ({ request, events, clock, address, apiAnswer }, problem: string) => {
    const votes = await brokenVotes(events, problem);
    const now = clock.now;
    const answer = await request.post(
      `/api/public/events/${events.get('Cena de verano').seeded.publicId}/participations`,
      {
        headers: {
          'x-vote-token': randomBytes(16).toString('base64url'),
          'x-forwarded-for': address,
          ...(now && { 'x-test-now': now.toISOString() }),
        },
        data: { name: 'Luis', votes },
      },
    );
    apiAnswer.status = answer.status();
  },
);

Then('it answers {int} and nothing is stored', async ({ events, apiAnswer }, status: number) => {
  expect(apiAnswer.status).toBe(status);
  expect(await events.votesOf('Cena de verano')).toEqual([]);
});
