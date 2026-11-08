import { expect, type Locator, type Page } from '@playwright/test';
import { settled } from '../settled.js';

/** How far around an element its focus ring may be drawn: the ring's offset and width, rounded up. */
const RING_MARGIN = 8;

/**
 * Walks the page with Tab, once round from where the focus is (past the browser's own controls,
 * where Tab also goes), until it comes back to a stop already seen, and checks that each stop is drawn differently while it has the focus (WCAG 2.2, 2.4.7):
 * the stop and its surroundings are captured focused and then blurred, and the two must differ.
 * Returns each stop's accessible name, in Tab order.
 */
export async function expectEveryStopShowsFocus(page: Page): Promise<string[]> {
  const stops: string[] = [];
  let outside = 0;
  for (let stop = 0; stop < 60 && outside < 2; stop++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluateHandle(() => document.activeElement);
    const where = await focused.evaluate((element) => {
      if (!element || element === document.body) return 'outside';
      if (element.hasAttribute('data-focus-walked')) return 'seen';
      element.setAttribute('data-focus-walked', '');
      return 'new';
    });
    if (where === 'seen') break;
    if (where === 'outside') {
      outside++;
      continue;
    }
    // Its accessible name, near enough: its label, else its text, else its image's.
    const name = await focused.evaluate((element) => {
      if (!element) return '';
      const label = element instanceof HTMLInputElement ? element.labels?.[0] : undefined;
      const names = [
        element.getAttribute('aria-label'),
        label?.textContent,
        element.textContent,
        element.querySelector('[alt]')?.getAttribute('alt'),
      ].map((text) => text?.trim().replace(/\s+/g, ' ') ?? '');
      return names.find((text) => text !== '') ?? '';
    });
    stops.push(name);

    // Measured at rest: a step still sliding in would move the stop away from its capture. A
    // control drawn by its label (a hidden radio) shows its focus there, so the label counts too.
    await settled(page);
    const box = await focused.evaluate((element) => {
      const label = element instanceof HTMLInputElement ? element.labels?.[0] : undefined;
      const boxes = [element, label]
        .filter((drawn) => drawn !== null && drawn !== undefined)
        .map((drawn) => drawn.getBoundingClientRect());
      return {
        left: Math.min(...boxes.map(({ left }) => left)),
        top: Math.min(...boxes.map(({ top }) => top)),
        right: Math.max(...boxes.map(({ right }) => right)),
        bottom: Math.max(...boxes.map(({ bottom }) => bottom)),
      };
    });
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    const x = Math.max(0, box.left - RING_MARGIN);
    const y = Math.max(0, box.top - RING_MARGIN);
    const clip = {
      x,
      y,
      width: Math.min(viewport.width, box.right + RING_MARGIN) - x,
      height: Math.min(viewport.height, box.bottom + RING_MARGIN) - y,
    };
    expect(clip.width > 0 && clip.height > 0, `the stop "${name}" is on screen`).toBe(true);
    const withFocus = await page.screenshot({ clip });
    // Blurring keeps Tab's starting point here, so the next Tab moves on from this stop.
    await focused.evaluate((element) => {
      (element as HTMLElement).blur();
    });
    await settled(page);
    const withoutFocus = await page.screenshot({ clip });
    expect(withFocus.equals(withoutFocus), `the stop "${name}" shows that it has the focus`).toBe(
      false,
    );
  }
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('[data-focus-walked]')) {
      element.removeAttribute('data-focus-walked');
    }
  });
  return stops;
}

/** Presses Tab until `target` has the focus, as a keyboard user reaches it; fails after 30 stops. */
export async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let stop = 0; stop < 30; stop++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${target.toString()}`);
}
