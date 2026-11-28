// The room of the page's scrollbar, as the browser keeps it. Where a scrollbar takes room (a mouse
// on Windows, or on a Mac that always shows them), a page that turned taller or shorter than the
// screen would grow or lose it and be narrower or wider: everything centred on it would move
// sideways, a card in the middle of a step's change among them. The page keeps that room always,
// on every page. Playwright's browser hides its scrollbars, so what is checked is that the room is
// kept, not where it falls. The API is not called, so nothing is stored.
import { expect, test } from '@playwright/test';

for (const path of ['/', '/privacy']) {
  test(`${path} keeps the room of its scrollbar, whether or not it is taller than the screen`, async ({
    page,
  }) => {
    await page.route('**/api/**', (route) => route.fulfill({ json: null }));
    await page.goto(path);

    const gutter = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollbarGutter,
    );

    expect(gutter).toBe('stable');
  });
}
