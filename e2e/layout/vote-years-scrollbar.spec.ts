// The voting page's times step in a computer's browser zoomed in until its page is as narrow as a
// phone's, with a classic scrollbar that takes 15 px of it: the step's width decides its columns,
// not the window's, so the year stays inside the card. Its own file: showing scrollbars takes a
// browser of its own (Playwright hides them). The API is answered here, so nothing is stored.
import { expect, test } from '@playwright/test';
import { eventOn, expectColumnsAndYear, toTimes } from './vote-times-step.js';

test.use({
  launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
  viewport: { width: 380, height: 800 },
  timezoneId: 'Europe/Madrid',
});

test('At 380 px wide with a 15 px scrollbar, the times step shows two columns of days, their year inside the card', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'layout phone', 'once, with the phone');
  await toTimes(
    page,
    eventOn(['2026-12-05', '2026-12-06', '2026-12-12', '2026-12-13', '2026-12-19']),
  );
  await page.addStyleTag({
    content: 'html { overflow-y: scroll; } ::-webkit-scrollbar { width: 15px; }',
  });
  expect(await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth)).toBe(
    15,
  );

  await expectColumnsAndYear(page, 2);
});
