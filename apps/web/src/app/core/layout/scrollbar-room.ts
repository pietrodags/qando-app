import {
  DOCUMENT,
  DestroyRef,
  type EnvironmentProviders,
  inject,
  provideEnvironmentInitializer,
} from '@angular/core';

/**
 * Marks the page with `data-scrollbar-room` on `<html>` while its scrollbars take room beside it.
 *
 * The page always keeps that room, on both sides (`styles/_base.scss`), and nothing of the page
 * can be drawn in it: under the mark the room is a near-black grey that frames the drawing. Where
 * scrollbars float over the page (a trackpad on a Mac, a phone) the room is empty and nothing is
 * marked, so the paper's colour still shows when the page is pulled past its ends. The room is
 * measured when the app starts and again on every resize (a zoom, a window moved to a screen
 * scaled otherwise).
 */
export function provideScrollbarRoom(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const root = inject(DOCUMENT).documentElement;

    const measure = (): void => {
      // The page's own box, not `clientWidth`: Chromium reports the window's whole width there
      // while its scrollbars are hidden, though it keeps their room.
      root.toggleAttribute('data-scrollbar-room', window.innerWidth > root.offsetWidth);
    };

    measure();
    const listening = new AbortController();
    window.addEventListener('resize', measure, { signal: listening.signal });
    inject(DestroyRef).onDestroy(() => {
      listening.abort();
    });
  });
}
