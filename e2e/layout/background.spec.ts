// The drawing behind every page (green waves on cream paper), as the browser shows it: each screen
// downloads only the version its shape and density need, and the drawing stays still while the
// page scrolls. The API is answered here, so these run against any URL.
import { expect, type Locator, type Page, test } from '@playwright/test';

interface Screen {
  name: string;
  width: number;
  height: number;
  density: number;
  /** The one version of the drawing this screen downloads. */
  version: string;
}

// Upright screens take the upright version, the larger one from 600 px wide (a tablet), where the
// phones' version would be stretched to almost twice its size. Screens on their side take the wide
// version, the larger one when they are at least 1024 px wide and dense, or wider than 1920 px.
const screens: Screen[] = [
  { name: 'a phone upright', width: 375, height: 740, density: 3, version: 'portrait-800' },
  { name: 'a large phone upright', width: 599, height: 900, density: 3, version: 'portrait-800' },
  { name: 'a small tablet upright', width: 600, height: 960, density: 2, version: 'portrait-1200' },
  { name: 'a tablet upright', width: 768, height: 1024, density: 2, version: 'portrait-1200' },
  { name: 'a phone on its side', width: 932, height: 430, density: 3, version: 'landscape-1920' },
  { name: 'a tablet on its side', width: 1024, height: 768, density: 2, version: 'landscape-2560' },
  { name: 'a laptop', width: 1280, height: 800, density: 1, version: 'landscape-1920' },
  { name: 'a dense laptop', width: 1440, height: 900, density: 2, version: 'landscape-2560' },
  { name: 'a full HD monitor', width: 1920, height: 1080, density: 1, version: 'landscape-1920' },
  { name: 'a wider monitor', width: 2560, height: 1440, density: 1, version: 'landscape-2560' },
];

/** Opens the home page, noting every version of the drawing it asks for. */
async function openHome(page: Page): Promise<string[]> {
  const asked: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/background/')) asked.push(pathname);
  });
  await page.goto('/');
  return asked;
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'layout phone', 'once, with the phone');
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: null }));
});

for (const screen of screens) {
  test.describe(`on ${screen.name}`, () => {
    test.use({
      viewport: { width: screen.width, height: screen.height },
      deviceScaleFactor: screen.density,
    });

    test(`On ${screen.name} (${screen.width}×${screen.height}, ${screen.density}x), the page downloads only the drawing's ${screen.version}`, async ({
      page,
    }) => {
      const asked = await openHome(page);
      const expected = [`/background/${screen.version}.webp`];
      await expect.poll(() => asked).toEqual(expected);
      await page.waitForLoadState('networkidle');
      expect(asked).toEqual(expected);
    });
  });
}

/** WCAG's contrast ratio of two opaque colours as the browser computes them, `rgb(…)`. */
function contrast(first: string, second: string): number {
  const [lighter = 0, darker = 0] = [first, second]
    .map((colour) => {
      const [red = 0, green = 0, blue = 0] = (colour.match(/\d+/g) ?? []).map((channel) => {
        const value = Number(channel) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    })
    .sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The colours the screen shows inside a box, as `rgb(…)`: the screenshot's pixels, read by the
 * browser itself (it decodes the image), so what is measured is the drawing as it is shown.
 */
async function coloursIn(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
): Promise<string[]> {
  const shot = await page.screenshot({ clip: box });
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas to read the screenshot');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const colours = new Set<string>();
    for (let index = 0; index < data.length; index += 4) {
      colours.add(`rgb(${data.slice(index, index + 3).join(', ')})`);
    }
    return [...colours];
  }, shot.toString('base64'));
}

/** What a piece of text is drawn on: the colours under its words, the words hidden. */
async function coloursBehind(page: Page, words: Locator): Promise<string[]> {
  const box = await words.evaluate((element: HTMLElement) => {
    element.style.color = 'transparent';
    const range = document.createRange();
    range.selectNodeContents(element);
    const { x, y, width, height } = range.getBoundingClientRect();
    return { x, y, width, height };
  });
  const colours = await coloursIn(page, box);
  await words.evaluate((element: HTMLElement) => {
    element.style.color = '';
  });
  return colours;
}

/** Each piece of text reads at 4.5:1 on every colour the drawing shows behind it. */
async function expectReadableOnTheDrawing(page: Page, words: Locator[]): Promise<void> {
  for (const piece of words) {
    await expect(piece).toBeVisible();
    const text = await piece.evaluate((element) => getComputedStyle(element).color);
    for (const behind of await coloursBehind(page, piece)) {
      expect(contrast(text, behind), `${text} on ${behind}`).toBeGreaterThanOrEqual(4.5);
    }
  }
}

// Upright, on their side and wide: where the drawing's waves fall behind the words changes with
// the screen's shape, as `cover` crops it.
const textScreens = [
  { width: 375, height: 740 },
  { width: 844, height: 390 },
  { width: 740, height: 360 },
  { width: 667, height: 375 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

for (const screen of textScreens) {
  test.describe(`at ${screen.width}×${screen.height}`, () => {
    test.use({ viewport: screen });

    test(`At ${screen.width}×${screen.height}, the words of a page being built and of a page loading read at 4.5:1 on every colour behind them`, async ({
      page,
    }) => {
      await page.route('**/api/auth/session', (route) =>
        route.fulfill({ json: { name: 'Ana', email: 'ana@example.com' } }),
      );
      // The voting page's event never arrives, so it stays on "loading".
      await page.route('**/api/public/events/**', () => undefined);
      const shown = page.waitForResponse((response) =>
        new URL(response.url()).pathname.startsWith('/background/'),
      );
      await page.goto('/my-events');
      await shown;
      await expectReadableOnTheDrawing(page, [
        page.getByRole('heading', { name: 'Mis eventos' }),
        page.getByText('Esta página está en construcción.'),
      ]);
      await page.goto(`/vote/${'k'.repeat(22)}`);
      await expectReadableOnTheDrawing(page, [
        page.getByRole('status').filter({ hasText: 'Cargando…' }),
      ]);
    });
  });
}

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Until the drawing arrives, the page shows its paper's colour", async ({ page }) => {
    await page.route('**/background/**', (route) => route.abort());
    await openHome(page);
    // The strip at the left edge shows only what is behind the cards.
    const shown = await coloursIn(page, { x: 0, y: 150, width: 80, height: 400 });
    expect(shown).toEqual(['rgb(235, 232, 218)']);
  });

  test('The drawing stays still while the page scrolls', async ({ page }) => {
    const drawn = page.waitForResponse((response) =>
      new URL(response.url()).pathname.startsWith('/background/'),
    );
    await openHome(page);
    await drawn;
    // A page long enough to scroll; the strip at the left edge shows only the drawing.
    await page.evaluate(() => {
      document.body.style.paddingBottom = '3000px';
    });
    const strip = (y: number) => page.screenshot({ clip: { x: 0, y, width: 80, height: 200 } });
    const top = await strip(150);
    // The drawing changes down the screen (a flat colour would pass the stillness check alone).
    expect(top.equals(await strip(550))).toBe(false);

    await page.evaluate(() => {
      window.scrollTo(0, 600);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
    expect((await strip(150)).equals(top)).toBe(true);
  });
});
