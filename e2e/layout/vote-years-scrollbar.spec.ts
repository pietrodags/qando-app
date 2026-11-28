// The voting page's times step in a computer's browser zoomed in until its page is as narrow as a
// phone's, with a classic scrollbar 15 px wide: the page keeps its room whether it shows it or
// not, so the year stays inside the card and the columns, and the voter's page of them, stay as
// they are when the scrollbar comes or goes with the page's height, also where three columns
// barely fit. Its own file: showing scrollbars takes a browser of its own (Playwright hides them).
// The API is answered here, so nothing is stored.
import { expect, type Page, test } from '@playwright/test';
import { currentStep } from '../steps/step-card.js';
import { eventOn, expectColumnsAndYear, toTimes } from './vote-times-step.js';

test.use({
  // A computer's browser, not the phone's screen the project emulates: its scrollbars take room.
  isMobile: false,
  launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
  viewport: { width: 380, height: 2000 },
  timezoneId: 'Europe/Madrid',
});

/** How wide a scrollbar the page shows now. */
function scrollbar(page: Page): Promise<number> {
  return page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
}

for (const { width, columns, place } of [
  { width: 380, columns: 2, place: '2 / 3' },
  // The step 311 px wide and a little more, where three columns barely fit.
  { width: 410, columns: 3, place: '2 / 2' },
]) {
  test(`At ${String(width)} px wide with a classic scrollbar, the times step keeps ${String(columns)} columns and the voter’s page while the scrollbar comes and goes`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'layout phone', 'once, with the phone');
    await page.setViewportSize({ width, height: 2000 });
    // The scrollbars are classic and 15 px wide before anything is drawn.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '::-webkit-scrollbar { width: 15px; }';
        document.head.append(style);
      });
    });
    await toTimes(
      page,
      eventOn(['2026-12-05', '2026-12-06', '2026-12-12', '2026-12-13', '2026-12-14', '2026-12-19']),
    );
    const shown = currentStep(page).locator('.place');

    // The page fits the window: no scrollbar shown, its room kept all the same.
    expect(await scrollbar(page)).toBe(0);
    await expectColumnsAndYear(page, columns);
    await currentStep(page).getByRole('button', { name: 'Días siguientes' }).click();
    await expect(shown).toHaveText(place);

    // The page grows past the window: the scrollbar comes.
    await page.evaluate(() => {
      document.body.style.paddingBottom = '3000px';
    });
    await expect.poll(() => scrollbar(page)).toBe(15);
    await expectColumnsAndYear(page, columns);
    await expect(shown).toHaveText(place);

    // And goes.
    await page.evaluate(() => {
      document.body.style.removeProperty('padding-bottom');
    });
    await expect.poll(() => scrollbar(page)).toBe(0);
    await expectColumnsAndYear(page, columns);
    await expect(shown).toHaveText(place);
  });
}
