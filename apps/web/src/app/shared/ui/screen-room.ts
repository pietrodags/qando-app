import {
  DestroyRef,
  type Signal,
  afterNextRender,
  afterRenderEffect,
  inject,
  signal,
} from '@angular/core';
import { StepStack } from './step-stack';

/** The parts of a step that its room is measured with: CSS selectors. */
interface Parts {
  readonly boxes: string;
  readonly end: string;
  readonly aside?: string;
}

/** Room left under what ends the step. */
const BOTTOM_ROOM_PX = 10;

/**
 * What the browser's numbers for a box that moves (a card sliding in) may miss a length by: far
 * less than a pixel's 64th, the least the browser lays a box out by.
 */
const NOISE_PX = 0.01;

/**
 * The height, in pixels, that the boxes of a step may take for what ends the step (its buttons)
 * to end above the bottom of the screen with the page scrolled to its top and, in a `StepStack`,
 * the steps above it folded into their tabs: a card that comes in while the step before it still
 * folds gets at once the room it keeps. `null` while `active()` is false or the parts are not on
 * the page. `parts` are CSS selectors: the boxes, inside `host`, which start at the same height,
 * and what ends the step below them, inside `host` or around it (the card the step is in); and,
 * if given, `aside`: boxes under the boxes whose height is left out of what goes below them, the
 * tallest one's, as if they were not there, for the page to show them only where the room has
 * some to spare. Measured again after a render in which a signal read by `active` changed, when
 * the window changes height and when the host, anything it is in or the page changes size: the
 * rows above the boxes, a late font, a step that folds above this one (which, in a stack, leaves
 * the room as it was). The boxes' own height never changes the room they have, so the measure
 * settles. Must be called in an injection context.
 */
export function screenRoom(
  host: HTMLElement,
  parts: Parts,
  active: () => boolean,
): Signal<number | null> {
  const room = signal<number | null>(null);
  const stack = inject(StepStack, { optional: true });
  const screenHeight = signal(window.innerHeight);
  const layoutChanges = signal(0);

  const resized = (): void => {
    screenHeight.set(window.innerHeight);
  };
  window.addEventListener('resize', resized);
  // Older browsers without it keep the first measure.
  const observer =
    'ResizeObserver' in window
      ? new ResizeObserver(() => {
          layoutChanges.update((count) => count + 1);
        })
      : undefined;
  // Once on the page: only then is the host inside what holds it.
  afterNextRender(() => {
    for (let at: Element | null = host; at; at = at.parentElement) observer?.observe(at);
  });
  inject(DestroyRef).onDestroy(() => {
    window.removeEventListener('resize', resized);
    observer?.disconnect();
  });

  afterRenderEffect(() => {
    layoutChanges();
    const screen = screenHeight();
    room.set(active() ? roomFor(host, parts, screen, stack?.rise(host) ?? 0) : null);
  });
  return room.asReadonly();
}

/**
 * What a screen `screen` pixels tall leaves between the boxes' top and what goes below the
 * longest box, with the host `rise` pixels higher on the page than it is now.
 */
function roomFor(host: HTMLElement, parts: Parts, screen: number, rise: number): number | null {
  const boxes = Array.from(host.querySelectorAll(parts.boxes), (box) =>
    box.getBoundingClientRect(),
  );
  const end = (host.querySelector(parts.end) ?? host.closest(parts.end))?.getBoundingClientRect();
  const [first] = boxes;
  if (first === undefined || end === undefined) return null;
  const aside = parts.aside === undefined ? [] : Array.from(host.querySelectorAll(parts.aside));
  const asideHeight = Math.max(0, ...aside.map((box) => box.getBoundingClientRect().height));
  const below = end.bottom - Math.max(...boxes.map(({ bottom }) => bottom)) - asideHeight;
  const top = pageTop(host) - rise + first.top - host.getBoundingClientRect().top;
  return Math.floor(screen - BOTTOM_ROOM_PX - top - below + NOISE_PX);
}

/** How far down the page an element starts, whatever moves it while a step slides in. */
function pageTop(element: HTMLElement): number {
  let top = 0;
  for (let at: Element | null = element; at instanceof HTMLElement; at = at.offsetParent) {
    top += at.offsetTop;
  }
  return top;
}
