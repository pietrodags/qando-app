import type { Page } from '@playwright/test';

/**
 * How far the page reaches past its own box, sideways: 0 when it never scrolls sideways. Measured
 * against the page's box (`offsetWidth`), not `clientWidth`: Playwright's Chromium hides its
 * scrollbars but keeps their room on each side, and reports the window's whole width there.
 */
export function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.offsetWidth,
  );
}
