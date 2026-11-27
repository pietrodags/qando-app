// Every page and step on the narrowest phones, as the browser lays them out: none is wider than the
// screen, and in the two times steps the columns and the step's arrows stay inside their card:
// three columns at 320 px, two whole ones at 280 px. A phone's browser widens its page to what it
// holds, so the page's width is compared with the screen's, never with the window's. It runs once,
// with the phone's project; the API is answered here, so nothing is stored.
import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { settled } from '../settled.js';
import { currentStep } from '../steps/step-card.js';

const participationId = 'p'.repeat(22);
const manageId = 'k'.repeat(22);
const resultsId = 'r'.repeat(22);

const july6 = { id: randomUUID(), dates: { kind: 'single', date: '2026-07-06' }, time: null };
const july10 = { id: randomUUID(), dates: { kind: 'single', date: '2026-07-10' }, time: null };

/** An event with a morning time and an evening range on each of four days. */
const withTimes = {
  title: 'Cena de verano',
  organizerName: 'Ana',
  note: null,
  deadline: '2026-07-01',
  timeZone: 'Europe/Madrid',
  anonymous: false,
  state: 'open',
  confirmedOption: null,
  options: ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-10'].flatMap((date) => [
    { id: randomUUID(), dates: { kind: 'single', date }, time: { kind: 'single', at: '09:00' } },
    {
      id: randomUUID(),
      dates: { kind: 'single', date },
      time: { kind: 'range', start: '18:00', end: '20:00' },
    },
  ]),
};

const managed = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  state: 'open',
  options: [july6, july10],
  confirmedOption: null,
  voters: 2,
  recommendedOptionIds: [july10.id],
  participationId: manageId,
  resultsId,
  // The widest wells: a failed email with its "Reintentar", one that waits for the closing.
  emails: [
    { type: 'summary', status: 'failed' },
    { type: 'voting-closed', status: 'scheduled' },
  ],
};

const results = {
  title: 'Cena de verano',
  timeZone: 'Europe/Madrid',
  final: false,
  outcome: 'one',
  voters: 3,
  attending: 2,
  notAttending: 1,
  winnersListed: true,
  winners: [{ option: july10, preferred: 1, available: 1, unavailable: 1 }],
  alternatives: [],
  confirmedOption: null,
};

/** Answers every request the pages send, with no one signed in, on a fixed day. */
async function answerApi(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.route('**/api/**', (route) => route.fulfill({ status: 404, json: {} }));
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: null }));
  await page.route('**/api/results/**', (route) => route.fulfill({ json: results }));
  await page.route(`**/api/events/${manageId}`, (route) => route.fulfill({ json: managed }));
  await page.route(`**/api/public/events/${participationId}`, (route) =>
    route.fulfill({ json: withTimes }),
  );
}

const DAYS = [
  'sábado, 20 de junio',
  'domingo, 21 de junio',
  'martes, 23 de junio',
  'jueves, 25 de junio',
];

/** The wizard up to `step`: 1 the title, 2 the calendar, 3 the times of four days, 4 the last. */
async function wizard(page: Page, step: number): Promise<void> {
  await page.goto('/');
  if (step === 1) return;
  await currentStep(page).getByLabel('¿Qué organizamos?').fill('Cena de verano');
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  if (step === 2) return;
  for (const day of DAYS)
    await currentStep(page).getByRole('button', { name: day, exact: true }).click();
  await currentStep(page).getByRole('switch', { name: 'Horario', exact: true }).click();
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  if (step === 3) return;
  await leave(page, 'Siguiente');
}

/** The voting page up to `step`: 1 the name, 2 the days, 3 the times, 4 the end. */
async function voting(page: Page, step: number): Promise<void> {
  await page.goto(`/vote/${participationId}`);
  await expect(page.getByRole('heading', { name: 'Cena de verano' })).toBeVisible();
  if (step === 1) return;
  await page.getByLabel('Escribe tu nombre para votar').fill('Luis');
  await page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
  if (step === 2) return;
  await page.getByRole('button', { name: 'Elegir las horas' }).click();
  if (step === 3) return;
  await leave(page, 'Confirmar mis horas');
}

/**
 * Turns the step's pages with its forward arrow until it leaves the step by `last`, with the
 * keyboard: a step that does not fit the screen may put the arrow where no finger reaches it, and
 * that is the times step's own test, not this way through it.
 */
async function leave(page: Page, last: string): Promise<void> {
  const forward = currentStep(page).locator('app-step-pager button').last();
  for (let turn = 0; turn < 10; turn++) {
    await settled(page);
    const label = await forward.getAttribute('aria-label');
    await forward.focus();
    await page.keyboard.press('Enter');
    if (label === last) return;
  }
  throw new Error(`the step never offered "${last}"`);
}

const pages: [string, (page: Page) => Promise<void>][] = [
  ['the home page', (page) => wizard(page, 1)],
  ["the wizard's dates step", (page) => wizard(page, 2)],
  ["the wizard's times step", (page) => wizard(page, 3)],
  ["the wizard's last step", (page) => wizard(page, 4)],
  ["the voting page's name step", (page) => voting(page, 1)],
  ["the voting page's days step", (page) => voting(page, 2)],
  ["the voting page's times step", (page) => voting(page, 3)],
  ["the voting page's end", (page) => voting(page, 4)],
  ['the results page', (page) => page.goto(`/results/${resultsId}`).then(() => undefined)],
  [
    'the management page, every section open',
    async (page) => {
      await page.goto(`/manage/${manageId}#t=${'T'.repeat(22)}`);
      await openEverySection(page);
    },
  ],
  ['the sign-in page', (page) => page.goto('/sign-in').then(() => undefined)],
  ['the page that is not found', (page) => page.goto('/no-such-page').then(() => undefined)],
];

/** Opens each section of the management page that starts closed, so what it holds is measured. */
async function openEverySection(page: Page): Promise<void> {
  await expect(page.locator('app-manage-section').first()).toBeVisible();
  const closed = page.locator('app-manage-section h2 > button[aria-expanded="false"]');
  // By name, each awaited open: a count read before the page marks a click's section open
  // would wait for one that is no longer closed.
  for (const name of await closed.allInnerTexts()) {
    const toggle = page.getByRole('button', { name: name.trim(), exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
}

/** How far each box reaches out of the content box of the card around it, in px, at most. */
function outOfCard(boxes: Locator): Promise<number[]> {
  return boxes.evaluateAll((elements) =>
    elements.map((element) => {
      const card = element.closest<HTMLElement>('.card')!;
      const style = getComputedStyle(card);
      const edge = card.getBoundingClientRect();
      const left = edge.left + card.clientLeft + parseFloat(style.paddingLeft);
      const right =
        edge.right -
        (edge.width - card.clientLeft - card.clientWidth) -
        parseFloat(style.paddingRight);
      const box = element.getBoundingClientRect();
      return Math.max(0, left - box.left, box.right - right);
    }),
  );
}

const screens = [
  { width: 320, height: 519, columns: 3, columnWidth: null },
  { width: 280, height: 600, columns: 2, columnWidth: 94 },
];

for (const screen of screens) {
  test.describe(`at ${screen.width} px wide`, () => {
    test.use({
      viewport: { width: screen.width, height: screen.height },
      isMobile: true,
      hasTouch: true,
    });
    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'layout phone', 'once, with the phone');
      await answerApi(page);
    });

    for (const [name, open] of pages) {
      test(`At ${screen.width} px wide, ${name} is no wider than the screen`, async ({ page }) => {
        await open(page);
        await settled(page);
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(width).toBeLessThanOrEqual(screen.width);
      });
    }

    for (const [name, open, columns] of [
      ["the wizard's times step", (page: Page) => wizard(page, 3), '.column:not([inert])'],
      ["the voting page's times step", (page: Page) => voting(page, 3), '.column'],
    ] as const) {
      test(`At ${screen.width} px wide, ${name} shows ${screen.columns} columns and its arrows inside its card`, async ({
        page,
      }) => {
        await open(page);
        await settled(page);
        const shown = currentStep(page).locator(columns);
        await expect(shown).toHaveCount(screen.columns);
        if (screen.columnWidth) {
          for (const box of await shown.evaluateAll((all) =>
            all.map((c) => c.getBoundingClientRect().width),
          )) {
            expect(box).toBeCloseTo(screen.columnWidth, 0);
          }
        }
        const out = await outOfCard(shown);
        out.push(...(await outOfCard(currentStep(page).locator('app-step-pager button'))));
        for (const reach of out) expect(reach).toBeLessThanOrEqual(0.5);
      });
    }
  });
}
