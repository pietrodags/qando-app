// The voting page's times step in a computer's browser zoomed in until its page is as narrow as a
// phone's, with a classic scrollbar 15 px wide: it counts as taken whether the page shows it or
// not, so the year stays inside the card and the columns, and the voter's page of them, stay as
// they are when the scrollbar comes or goes with the page's height. Its own file: showing
// scrollbars takes a browser of its own (Playwright hides them). The API is answered here, so
// nothing is stored.
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

test('At 380 px wide with a classic scrollbar, the times step keeps two columns and the voter’s page while the scrollbar comes and goes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'layout phone', 'once, with the phone');
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
    eventOn(['2026-12-05', '2026-12-06', '2026-12-12', '2026-12-13', '2026-12-19']),
  );
  const place = currentStep(page).locator('.place');

  // The page fits the window: no scrollbar shown, its room counted all the same.
  expect(await scrollbar(page)).toBe(0);
  await expectColumnsAndYear(page, 2);
  await currentStep(page).getByRole('button', { name: 'Días siguientes' }).click();
  await expect(place).toHaveText('2 / 3');

  // The page grows past the window: the scrollbar comes.
  await page.evaluate(() => {
    document.body.style.paddingBottom = '3000px';
  });
  await expect.poll(() => scrollbar(page)).toBe(15);
  await expectColumnsAndYear(page, 2);
  await expect(place).toHaveText('2 / 3');

  // And goes.
  await page.evaluate(() => {
    document.body.style.removeProperty('padding-bottom');
  });
  await expect.poll(() => scrollbar(page)).toBe(0);
  await expectColumnsAndYear(page, 2);
  await expect(place).toHaveText('2 / 3');
});
