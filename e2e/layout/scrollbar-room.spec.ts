// The room of the page's scrollbars, as the browser keeps it. Where a scrollbar takes room (a mouse
// on Windows, or on a Mac that always shows them), a page that turned taller or shorter than the
// screen would grow or lose it and be narrower or wider: everything centred on it would move
// sideways, a card in the middle of a step's change among them. The page keeps that room always,
// on every page, on both sides, so the drawing stays centred between two bands of one width. Where
// the room is taken, the page is marked and the bands are a near-black grey that frames the
// drawing, the page's scrollbar a lighter thumb on a track of that grey, while a box inside the
// page that scrolls keeps the system's scrollbar; elsewhere (a trackpad on a Mac, a phone) nothing is marked and the paper's colour shows
// past the page's ends. Playwright's Chromium hides its scrollbars but keeps their room, so the
// frame is seen on the computer's screen; the phone's and the tablet's float them. The API is not
// called, so nothing is stored.
import { expect, type Page, test } from '@playwright/test';
import { coloursIn } from './screen-colours.js';

const GREY = 'rgb(34, 34, 34)';
const PAPER = 'rgb(235, 232, 218)';
const THUMB = 'rgb(108, 108, 108)';

/** The room on each side of the page, its mark and its background, as the browser has them. */
function measure(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const drawing = document
      .querySelector('app-waves-background .drawing')
      ?.getBoundingClientRect();
    return {
      gutter: getComputedStyle(root).scrollbarGutter,
      room: (innerWidth - root.offsetWidth) / 2,
      marked: root.hasAttribute('data-scrollbar-room'),
      background: getComputedStyle(root).backgroundColor,
      scrollbar: getComputedStyle(root).scrollbarColor,
      // A box inside the page that scrolls draws its scrollbar as the system does.
      inside: getComputedStyle(document.body).scrollbarColor,
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
}, testInfo) => {
  test.skip(testInfo.project.name !== 'layout desktop', "a computer's browser keeps the room");
  await page.goto('/');
  await expect(page.locator('app-waves-background svg.scene g path').first()).toBeAttached();
  const { room, marked, background, scrollbar, inside, drawing } = await measure(page);
  const height = page.viewportSize()?.height ?? 0;
  const width = page.viewportSize()?.width ?? 0;

  expect(room).toBeGreaterThan(0);
  expect({ marked, background }).toEqual({ marked: true, background: GREY });
  expect({ scrollbar, inside }).toEqual({ scrollbar: `${THUMB} ${GREY}`, inside: 'auto' });
  expect(drawing).toEqual({ left: room, right: room });
  expect(await coloursIn(page, { x: 0, y: 0, width: room, height })).toEqual([GREY]);
  expect(await coloursIn(page, { x: width - room, y: 0, width: room, height })).toEqual([GREY]);
  // Beside the band, the drawing's waves and grain, not the body's flat paper over them.
  const beside = await coloursIn(page, { x: room, y: 0, width: 1, height });
  expect(beside).not.toContain(GREY);
  expect(beside).not.toEqual([PAPER]);
});

test('where the scrollbars take no room, marks nothing and keeps the paper past the page', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'layout desktop',
    'phones and tablets float their scrollbars',
  );
  await page.goto('/');

  expect(await measure(page)).toMatchObject({
    room: 0,
    marked: false,
    background: 'rgba(0, 0, 0, 0)',
    scrollbar: 'auto',
  });
  await expect(page.locator('body')).toHaveCSS('background-color', PAPER);
});
