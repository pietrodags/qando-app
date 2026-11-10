import { computed, effect, signal, type Signal } from '@angular/core';

/**
 * The whole seconds left until a clock time, in milliseconds (null: nothing to wait for), for a
 * wait the API asked for. Counted down each second from the clock, so a tab whose timers were
 * held back still shows the time left; 0 once the time has come, and without one. A new time
 * starts again. Must run in an injection context, whose end stops the count.
 */
export function secondsUntil(until: () => number | null): Signal<number> {
  const end = computed(until);
  /** Changes each second while a time is waited for: the clock is then read again. */
  const beat = signal(0);

  effect((onCleanup) => {
    const time = end();
    if (time === null) return;
    const timer = setInterval(() => {
      beat.update((beats) => beats + 1);
      if (Date.now() >= time) clearInterval(timer);
    }, 1000);
    onCleanup(() => {
      clearInterval(timer);
    });
  });

  // The clock is read whenever the time or the beat changes, so a time given long after this
  // was created is counted from now. Without a time, the one waited for is long past.
  return computed(() => {
    beat();
    return Math.max(0, Math.ceil(((end() ?? 0) - Date.now()) / 1000));
  });
}
