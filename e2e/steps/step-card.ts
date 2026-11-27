import type { Locator, Page } from '@playwright/test';

/**
 * The step on screen: the only region named after its step ("paso 2", or the wizard's "último
 * paso"; in the options editor, which has no numbered steps, its "fechas" or "horarios"). The
 * steps above it (tabs) and a step folding away (still on screen, inert, for a moment) are not
 * regions, so a button looked up here is never one of theirs.
 */
export function currentStep(page: Page): Locator {
  return page.getByRole('region', { name: /^(paso \d+|último paso|fechas|horarios)$/ });
}

/** The steps have stopped moving: a card that comes in or folds away is measured where it stays. */
export async function stepsSettled(page: Page): Promise<void> {
  // A step that leaves cancels its own: whatever ends, ended.
  await page
    .locator('app-step-stack')
    .evaluate((stack) =>
      Promise.allSettled(stack.getAnimations({ subtree: true }).map(({ finished }) => finished)),
    );
}
