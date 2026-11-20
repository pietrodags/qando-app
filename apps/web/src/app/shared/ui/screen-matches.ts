import { DestroyRef, type Signal, inject, signal } from '@angular/core';

/** A device with no mouse: nothing hovers, or its pointer is a finger. */
export const TOUCH_QUERY = '(hover: none), (pointer: coarse)';

/**
 * Whether the screen matches a media query (`(min-width: 650px)`), now and from then on: it
 * follows the screen as it turns or the window is resized, and stops when the component it was
 * called for is gone. Must be called in an injection context.
 */
export function screenMatches(query: string): Signal<boolean> {
  const list = window.matchMedia(query);
  const matches = signal(list.matches);
  const changed = (event: MediaQueryListEvent): void => {
    matches.set(event.matches);
  };
  list.addEventListener('change', changed);
  inject(DestroyRef).onDestroy(() => {
    list.removeEventListener('change', changed);
  });
  return matches.asReadonly();
}
