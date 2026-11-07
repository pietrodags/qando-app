import { expect, type Page } from '@playwright/test';
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

function day(page: Page, isoDate: string) {
  return page.getByRole('button', { name: new RegExp(`^${dayName(isoDate)}:`) });
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
  // Only from step 1, the current card: a step folding away still shows (inert) for a moment.
  if (await page.getByRole('region', { name: 'paso 1' }).isVisible()) {
    await page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
  }
  const name = choiceName(dates);
  const target = page.getByRole('button', { name: new RegExp(`^${name}:`) });
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

/** From the days, after the last month's check: the overlay that sends the vote. */
function sendButton(page: Page) {
  return page.getByRole('button', { name: 'Confirmar mi voto' });
}

async function openConfirmation(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Confirmar mis días' }).click();
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
  await page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
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
    await expect(page.getByRole('button', { name: /: Preferido$/ })).toHaveCount(1);
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
  await page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
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
  return page.getByRole('button', { name: new RegExp(`^${dayName(isoDate)}, ${time}:`) });
}

When(
  'I mark the day {string} as unavailable and go on to the times',
  async ({ page }, date: string) => {
    await mark(page, date, 'unavailable');
    await page.getByRole('button', { name: 'Elegir las horas' }).click();
  },
);

Then('I see only the times of {string}', async ({ page }, date: string) => {
  const blocks = page.getByRole('button', { name: /, .+: (Disponible|Preferido|No puedo)$/ });
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
  await page.getByRole('button', { name: 'Confirmar mis horas' }).click();
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
async function expectNoVoting(page: Page): Promise<void> {
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
