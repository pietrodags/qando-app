/**
 * The page as a test has it while the times and their summary take each other's place
 * (`PartHandover`): jsdom scrolls nothing, so a test says how far down the page is and how tall
 * the screen is, and reads how tall the page is kept, whatever keeps it.
 */
import { restoreWindow, setWindow } from './window-values';

export interface TestPage {
  /** The page is now `scrollY` px down. */
  scroll(scrollY: number): void;
  /** How tall the page is kept, in px; `null` while nothing keeps it. */
  kept(): number | null;
}

/**
 * The page `scrollY` px down a screen `screenHeight` px tall; without `screenHeight`, the screen
 * the test already has.
 */
export function installTestPage(scrollY: number, screenHeight?: number): TestPage {
  setWindow('scrollY', scrollY);
  if (screenHeight !== undefined) setWindow('innerHeight', screenHeight);
  return {
    scroll: (to) => {
      setWindow('scrollY', to);
    },
    kept: () => {
      const height = document.documentElement.style.getPropertyValue('min-block-size');
      return height === '' ? null : Number.parseFloat(height);
    },
  };
}

/**
 * The page at its top, on jsdom's screen, kept by nothing, as before `installTestPage`: every
 * value of the window a test set (`setWindow`) back as it was.
 */
export function removeTestPage(): void {
  restoreWindow();
  document.documentElement.style.removeProperty('min-block-size');
}
