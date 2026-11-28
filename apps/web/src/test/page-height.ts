/**
 * The page as a test has it while the times and their summary take each other's place
 * (`PartHandover`): jsdom scrolls nothing, so a test says how far down the page is and how tall
 * the screen is, and reads how tall the page is kept, whatever keeps it.
 */
export interface TestPage {
  /** The page is now `scrollY` px down. */
  scroll(scrollY: number): void;
  /** How tall the page is kept, in px; `null` while nothing keeps it. */
  kept(): number | null;
}

function define(name: 'scrollY' | 'innerHeight', value: number): void {
  Object.defineProperty(window, name, { configurable: true, value });
}

/**
 * The page `scrollY` px down a screen `screenHeight` px tall; without `screenHeight`, the screen
 * the test already has.
 */
export function installTestPage(scrollY: number, screenHeight?: number): TestPage {
  define('scrollY', scrollY);
  if (screenHeight !== undefined) define('innerHeight', screenHeight);
  return {
    scroll: (to) => {
      define('scrollY', to);
    },
    kept: () => {
      const height = document.documentElement.style.getPropertyValue('min-block-size');
      return height === '' ? null : Number.parseFloat(height);
    },
  };
}

/** The page at its top, on jsdom's screen, kept by nothing, as before `installTestPage`. */
export function removeTestPage(): void {
  Reflect.deleteProperty(window, 'scrollY');
  Reflect.deleteProperty(window, 'innerHeight');
  document.documentElement.style.removeProperty('min-block-size');
}
