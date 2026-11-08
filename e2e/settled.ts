import type { Page } from '@playwright/test';

/**
 * Waits for the page's finite animations, so colours are read at rest, not mid-transition. A step
 * may end before the browser starts the animation it caused (a dialog opening), so two frames pass
 * before each look, and animations that start others are waited for in turn.
 */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let round = 0; round < 10; round++) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const running = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState !== 'finished' &&
            animation.effect?.getTiming().iterations !== Infinity,
        );
      if (running.length === 0) return;
      await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
    }
  });
}
