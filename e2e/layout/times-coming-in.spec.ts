// The lists of hours of the two times steps on a phone, as the browser draws them while the step's
// card comes in and the step before it folds into its tab: below 650 px they are sized to the room
// the screen leaves, and they come in at the size they keep, without growing when the card
// settles. It runs once, with the phone's project, on a phone's screen; the API is answered here
// and the wizard sends nothing before its last step, so nothing is stored.
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { currentStep, stepsSettled } from '../steps/step-card.js';

const PHONE = { width: 390, height: 844 };

const participationId = 'p'.repeat(22);

/** Ten times on each of three days: more than a phone shows at once. */
const withTimes = {
  title: 'Cena de verano',
  organizerName: 'Ana',
  note: null,
  deadline: '2026-07-01',
  timeZone: 'Europe/Madrid',
  anonymous: false,
  state: 'open',
  confirmedOption: null,
  options: ['2026-07-06', '2026-07-07', '2026-07-08'].flatMap((date) =>
    Array.from({ length: 10 }, (_, hour) => ({
      id: randomUUID(),
      dates: { kind: 'single', date },
      time: { kind: 'single', at: `${String(hour + 9).padStart(2, '0')}:00` },
    })),
  ),
};

/**
 * The heights of the boxes `boxes` finds in the step's card, one list a frame, from before `go`
 * to two frames after the steps have stopped moving; frames without them are left out.
 */
async function heightsWhile(page: Page, boxes: string, go: () => Promise<void>): Promise<string[]> {
  // Ends with the page's "recorded" event, sent below; its first frame is asked for before `go`.
  const recorded = page.evaluate(
    (selector) =>
      new Promise<string[]>((resolve) => {
        const frames: string[] = [];
        let on = true;
        window.addEventListener('recorded', () => (on = false), { once: true });
        const look = (): void => {
          const found = Array.from(document.querySelectorAll(selector), (box) =>
            Math.round(box.getBoundingClientRect().height),
          );
          if (found.length > 0) frames.push(found.join(' '));
          if (on) requestAnimationFrame(look);
          else resolve(frames);
        };
        requestAnimationFrame(look);
      }),
    `.card ${boxes}`,
  );
  await go();
  await expect(page.locator(`.card ${boxes}`).first()).toBeVisible();
  await stepsSettled(page);
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.dispatchEvent(new Event('recorded'));
  });
  return recorded;
}

/** Every frame drew the boxes at the size of the last one, over more than a few frames. */
function expectOneSize(frames: readonly string[]): void {
  expect(frames.length).toBeGreaterThan(5);
  expect(new Set(frames)).toEqual(new Set([frames.at(-1)]));
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'layout phone', 'once, with the phone');
  await page.setViewportSize(PHONE);
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
});

test("the wizard's lists of hours come in at the size they keep", async ({ page }) => {
  await page.goto('/');
  await currentStep(page).getByLabel('¿Qué organizamos?').fill('Cena de verano');
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  for (const day of ['sábado, 20 de junio', 'domingo, 21 de junio', 'martes, 23 de junio']) {
    await currentStep(page).getByRole('button', { name: day, exact: true }).click();
  }
  await currentStep(page).getByRole('switch', { name: 'Horario', exact: true }).click();
  await stepsSettled(page);

  const frames = await heightsWhile(page, '.hours', () =>
    currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click(),
  );

  expectOneSize(frames);
});

test("the voting page's boxes of times come in at the size they keep", async ({ page }) => {
  await page.route(`**/api/public/events/${participationId}`, (route) =>
    route.fulfill({ json: withTimes }),
  );
  await page.goto(`/vote/${participationId}`);
  await page.getByLabel('Escribe tu nombre para votar').fill('Luis');
  await page.getByRole('button', { name: 'Quiero elegir mis preferencias…' }).click();
  await stepsSettled(page);

  const frames = await heightsWhile(page, '.columns .blocks', () =>
    page.getByRole('button', { name: 'Elegir las horas' }).click(),
  );

  expectOneSize(frames);
});
