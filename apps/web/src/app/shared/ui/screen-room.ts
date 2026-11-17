import { DestroyRef, type Signal, afterRenderEffect, inject, signal } from '@angular/core';

/** Room left under what ends the step. */
const BOTTOM_ROOM_PX = 10;

/**
 * The height, in pixels, that the boxes of a step may take for what ends the step (its buttons)
 * to end above the bottom of the screen with the page scrolled to its top; `null` while
 * `active()` is false or the parts are not on the page. `parts` are CSS selectors inside `host`:
 * the boxes, which start at the same height, and what ends the step below them. Measured again
 * after a render in which a signal read by `active` changed, when the window changes height and
 * when the host or the page changes size (the rows above the boxes, a late font, a step above).
 * The boxes' own height never changes the room they have, so the measure settles. Must be called
 * in an injection context.
 */
export function screenRoom(
  host: HTMLElement,
  parts: { readonly boxes: string; readonly end: string },
  active: () => boolean,
): Signal<number | null> {
  const room = signal<number | null>(null);
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
  observer?.observe(host);
  observer?.observe(document.body);
  inject(DestroyRef).onDestroy(() => {
    window.removeEventListener('resize', resized);
    observer?.disconnect();
  });

  afterRenderEffect(() => {
    layoutChanges();
    const screen = screenHeight();
    room.set(active() ? roomFor(host, parts, screen) : null);
  });
  return room.asReadonly();
}

/**
 * What a screen `screen` pixels tall leaves between the boxes' top and what goes below the
 * longest box.
 */
function roomFor(
  host: HTMLElement,
  parts: { readonly boxes: string; readonly end: string },
  screen: number,
): number | null {
  const boxes = Array.from(host.querySelectorAll(parts.boxes), (box) =>
    box.getBoundingClientRect(),
  );
  const end = host.querySelector(parts.end)?.getBoundingClientRect();
  const [first] = boxes;
  if (first === undefined || end === undefined) return null;
  const below = end.bottom - Math.max(...boxes.map(({ bottom }) => bottom));
  const top = pageTop(host) + first.top - host.getBoundingClientRect().top;
  return Math.floor(screen - BOTTOM_ROOM_PX - top - below);
}

/** How far down the page an element starts, whatever moves it while a step slides in. */
function pageTop(element: HTMLElement): number {
  let top = 0;
  for (let at: Element | null = element; at instanceof HTMLElement; at = at.offsetParent) {
    top += at.offsetTop;
  }
  return top;
}
