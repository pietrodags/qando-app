import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { settled } from './settled.js';

/** The axe rules of WCAG 2.2 level AA, the level the app meets (A and AA of 2.0, 2.1 and 2.2). */
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/** Each page's markup at its last check: a page is checked again only in a new state. */
const lastChecked = new WeakMap<Page, string>();

/** How many times a page that changes while axe reads it is read again. */
const ROUNDS = 3;

/**
 * Checks a page with axe against WCAG 2.2 AA once its animations end, failing with each rule
 * broken and the elements that break it. A page whose markup has not changed since its last check
 * is not checked again. A page that changes while axe reads it (a toast that comes in once a
 * request answers, after the step has ended) may have been read mid-animation, so it is read
 * again once at rest; one that keeps changing is judged by its last reading.
 */
export async function expectAccessible(page: Page): Promise<void> {
  if (page.isClosed() || page.url() === 'about:blank') return;
  let markup = '';
  let violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'] = [];
  for (let round = 0; round < ROUNDS; round++) {
    await settled(page);
    markup = await page.content();
    if (lastChecked.get(page) === markup) return;
    ({ violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze());
    if ((await page.content()) === markup) break;
  }
  lastChecked.set(page, markup);

  const found = violations.map(
    ({ id, impact, help, nodes }) =>
      `${id} (${impact ?? 'unknown'}): ${help} — ${nodes.map(({ target }) => target.join(' ')).join(', ')}`,
  );
  expect(found, `accessibility violations on ${page.url()}`).toEqual([]);
}
