import {
  DOCUMENT,
  DestroyRef,
  type EnvironmentProviders,
  inject,
  provideEnvironmentInitializer,
} from '@angular/core';

/**
 * Lets text fields show the focus ring only when the keyboard brought the focus to them.
 *
 * Browsers treat a text field as `:focus-visible` however it got the focus (on load, by a click,
 * by a tap), so their own rule cannot tell a keyboard user apart. This remembers whether the last
 * interaction was a key or a pointer and, each time the focus moves, marks the page with
 * `data-keyboard-focus` on `<html>` when a key brought it there; `styles/_base.scss` draws the
 * text-field ring only under that mark. Typing never changes the mark: only the next focus does.
 */
export function provideKeyboardFocusRing(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const document = inject(DOCUMENT);
    const root = document.documentElement;
    let byKeyboard = false;

    const onKey = (): void => {
      byKeyboard = true;
    };
    const onPointer = (): void => {
      byKeyboard = false;
    };
    const onFocus = (): void => {
      root.toggleAttribute('data-keyboard-focus', byKeyboard);
    };

    // Captured, so a component that stops an event's propagation cannot hide it from here; one
    // signal removes the three listeners when the app is destroyed.
    const listening = new AbortController();
    const options = { capture: true, signal: listening.signal };
    document.addEventListener('keydown', onKey, options);
    document.addEventListener('pointerdown', onPointer, options);
    document.addEventListener('focusin', onFocus, options);
    inject(DestroyRef).onDestroy(() => {
      listening.abort();
    });
  });
}
