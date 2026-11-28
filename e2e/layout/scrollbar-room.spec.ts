// The room of the page's scrollbars, as the browser keeps it. Where a scrollbar takes room (a mouse
// on Windows, or on a Mac that always shows them), a page that turned taller or shorter than the
// screen would grow or lose it and be narrower or wider: everything centred on it would move
// sideways, a card in the middle of a step's change among them. The page keeps that room always,
// on every page, on both sides, so the drawing stays centred between two bands of one width. Where
// the room is taken, the page is marked and the bands are a near-black grey that frames the
// drawing; elsewhere (a trackpad on a Mac, a phone) nothing is marked and the paper's colour shows
// past the page's ends. Playwright's Chromium hides its scrollbars but keeps their room, so the
// frame is seen here; a page with no scrollbars at all stands in for floating ones. The API is not
// called, so nothing is stored.
import { expect, type Page, test } from '@playwright/test';
import { coloursIn } from './screen-colours.js';

const GREY = 'rgb(34, 34, 34)';

/** The room on each side of the page, its mark and its background, as the browser has them. */
function measure(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const drawing = document.querySelector('app-waves-background .drawing')?.getBoundingClientRect();
    return {
      gutter: getComputedStyle(root).scrollbarGutter,
      room: (innerWidth - root.offsetWidth) / 2,
      marked: root.hasAttribute('data-scrollbar-room'),
      background: getComputedStyle(root).backgroundColor,
      drawing: { left: drawing?.left, right: innerWidth - (drawing?.right ?? 0) },
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: null }));
});

for (const path of ['/', '/privacy']) {
  test(`${path} keeps the room of its scrollbars on both sides, whether or not it is taller than the screen`, async ({
    page,
  }) => {
    await page.goto(path);

    expect((await measure(page)).gutter).toBe('stable both-edges');
  });
}

test('where the scrollbars take room, frames the page in grey on both sides and the drawing whole between', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('app-waves-background svg.scene g path').first()).toBeAttached();
  const { room, marked, background, drawing } = await measure(page);
  const height = page.viewportSize()?.height ?? 0;
  const width = page.viewportSize()?.width ?? 0;

  expect(room).toBeGreaterThan(0);
  expect({ marked, background }).toEqual({ marked: true, background: GREY });
  expect(drawing).toEqual({ left: room, right: room });
  expect(await coloursIn(page, { x: 0, y: 0, width: room, height })).toEqual([GREY]);
  expect(await coloursIn(page, { x: width - room, y: 0, width: room, height })).toEqual([GREY]);
  expect(await coloursIn(page, { x: room, y: 0, width: 1, height })).not.toContain(GREY);
});

test('where the scrollbars take no room, marks nothing and keeps the paper past the page', async ({
  page,
}) => {
  await page.goto('/');
  await page.addStyleTag({ content: 'html { scrollbar-width: none; }' });
  const size = page.viewportSize() ?? { width: 0, height: 0 };
  await page.setViewportSize({ ...size, width: size.width - 10 });

  // The browser tells the page of its new size in a later task.
  await expect.poll(() => measure(page)).toMatchObject({
    room: 0,
    marked: false,
    background: 'rgba(0, 0, 0, 0)',
  });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(235, 232, 218)');
});
