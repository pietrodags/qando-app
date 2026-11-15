import type { Locator, Page } from '@playwright/test';

/**
 * The step on screen: the only region named after its step ("paso 2"). The steps above it (tabs)
 * and a step folding away (still on screen, inert, for a moment) are not regions, so a button
 * looked up here is never one of theirs.
 */
export function currentStep(page: Page): Locator {
  return page.getByRole('region', { name: /^paso \d+$/ });
}
