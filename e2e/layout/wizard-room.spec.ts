// The organizer wizard as the browser draws it, at each width: the label of the card on screen
// ("paso 1", "último paso") stands apart from what the step asks under it, the last step's labels
// are bold in the brand's typeface, and its "Voto anónimo" reads its ⓘ, its name and then its
// switch, the switch at the fields' right edge. The API is not called for anything these checks
// need, so nothing is stored or sent.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { currentStep, stepsSettled as settled } from '../steps/step-card.js';

/**
 * The least room between a step's label and what the step shows first, `--q-space-2`, measured
 * between their boxes (the label's line is tall: the text has more room than that); step 1, which
 * asks one question, leaves more, `--q-space-10`.
 */
const LABEL_ROOM = 4;
const STEP_1_ROOM = 30;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  if (!found) throw new Error(`${locator.toString()} is not drawn`);
  return found;
}

/** The room between the label of the card on screen and the top of `first`, in px. */
async function roomUnderLabel(page: Page, first: Locator): Promise<number> {
  await expect(first).toBeVisible();
  await settled(page);
  const label = await box(page.locator('.step.card .step-label'));
  const under = await box(first);
  return under.y - (label.y + label.height);
}

/** From the home page to the last step, with a title and Saturday 20 June. */
async function toLastStep(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-06-15T10:00:00+02:00'));
  await page.goto('/');
  await currentStep(page).getByLabel('¿Qué organizamos?').fill('Cena de verano');
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await currentStep(page).getByRole('button', { name: 'sábado, 20 de junio', exact: true }).click();
  await currentStep(page).getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(currentStep(page)).toHaveAccessibleName('último paso');
}

test('step 1 asks its question with room under its label', async ({ page }) => {
  await page.goto('/');

  const room = await roomUnderLabel(page, page.getByText('¿Qué organizamos?', { exact: true }));

  expect(room).toBeGreaterThanOrEqual(STEP_1_ROOM);
});

test('the last step asks the deadline with room under its label', async ({ page }) => {
  await toLastStep(page);

  const room = await roomUnderLabel(
    page,
    page.getByText('¿Hasta cuándo quieres que voten los participantes?', { exact: true }),
  );

  expect(room).toBeGreaterThanOrEqual(LABEL_ROOM);
});

test("the last step's labels are bold in the brand's typeface", async ({ page }) => {
  await toLastStep(page);
  const labels = [
    page.getByText('¿Hasta cuándo quieres que voten los participantes?', { exact: true }),
    page.getByRole('button', { name: 'Añade un comentario, si quieres.' }),
    page.getByText('Voto anónimo', { exact: true }),
    page.getByText('Tu nombre, para comunicárselo a los demás.', { exact: true }),
    page.getByText('Tu email, para recibir un resumen y los resultados.', { exact: true }),
  ];

  for (const label of labels) {
    const look = await label.evaluate((element) => {
      const style = getComputedStyle(element);
      return { family: style.fontFamily.split(',')[0]?.trim(), weight: style.fontWeight };
    });
    expect(look, await label.innerText()).toEqual({
      family: '"Comfortaa Variable"',
      weight: '700',
    });
  }
});

test('"Voto anónimo" reads its ⓘ, its name and its switch, the switch at the fields\' right edge', async ({
  page,
}) => {
  await toLastStep(page);
  await expect(page.getByRole('switch', { name: 'Voto anónimo' })).toBeVisible();
  await settled(page);

  const name = await box(page.getByText('Voto anónimo', { exact: true }));
  const info = await box(page.getByRole('button', { name: '¿Qué es el voto anónimo?' }));
  const toggle = await box(page.getByRole('switch', { name: 'Voto anónimo' }));
  const field = await box(page.getByLabel('Tu nombre, para comunicárselo a los demás.'));

  expect(name.x).toBeGreaterThanOrEqual(info.x + info.width);
  expect(toggle.x).toBeGreaterThanOrEqual(name.x + name.width);
  expect(Math.abs(toggle.x + toggle.width - (field.x + field.width))).toBeLessThanOrEqual(1);
  // On one line: the three share their middle.
  for (const part of [info, toggle]) {
    expect(Math.abs(part.y + part.height / 2 - (name.y + name.height / 2))).toBeLessThanOrEqual(2);
  }
});

test('while "Crear" waits, the name field and the note\'s question are dimmed as the deadline is', async ({
  page,
}) => {
  await toLastStep(page);
  await page.getByLabel('Tu nombre, para comunicárselo a los demás.').fill('Ana');
  await page
    .getByLabel('Tu email, para recibir un resumen y los resultados.')
    .fill('ana@example.com');
  // Whatever "Crear" asks for gets no answer: the step waits.
  await page.route('**/api/**', () => undefined);

  await page.getByRole('button', { name: 'Crear', exact: true }).click();

  const deadline = page.getByRole('combobox', { name: 'Día', exact: true });
  await expect(deadline).toBeDisabled();
  const dimmed = await opacity(deadline);
  expect(Number(dimmed)).toBeLessThan(1);
  const others = {
    name: page.getByLabel('Tu nombre, para comunicárselo a los demás.'),
    note: page.getByRole('button', { name: 'Añade un comentario, si quieres.' }),
  };
  for (const [which, other] of Object.entries(others)) {
    expect(await opacity(other), which).toBe(dimmed);
  }
});

/** How opaque the element is drawn, its own and its ancestors' opacity multiplied. */
function opacity(element: Locator): Promise<string> {
  return element.evaluate((start) => {
    let drawn = 1;
    for (let at: Element | null = start; at; at = at.parentElement) {
      drawn *= Number(getComputedStyle(at).opacity);
    }
    return String(Math.round(drawn * 100) / 100);
  });
}
