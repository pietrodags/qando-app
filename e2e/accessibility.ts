import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { settled } from './settled.js';

/** The axe rules of WCAG 2.2 level AA, the level the app meets (A and AA of 2.0, 2.1 and 2.2). */
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/** Each page's markup at its last check: a page is checked again only in a new state. */
const lastChecked = new WeakMap<Page, string>();

/**
 * Checks a page with axe against WCAG 2.2 AA once its animations end, failing with each rule
 * broken and the elements that break it. A page whose markup has not changed since its last check
 * is not checked again.
 */
export async function expectAccessible(page: Page): Promise<void> {
  if (page.isClosed() || page.url() === 'about:blank') return;
  await settled(page);
  const markup = await page.content();
  if (lastChecked.get(page) === markup) return;
  lastChecked.set(page, markup);

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  const found = violations.map(
    ({ id, impact, help, nodes }) =>
      `${id} (${impact ?? 'unknown'}): ${help} — ${nodes.map(({ target }) => target.join(' ')).join(', ')}`,
  );
  expect(found, `accessibility violations on ${page.url()}`).toEqual([]);
}
