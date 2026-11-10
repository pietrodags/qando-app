import { computed, effect, signal, type Signal } from '@angular/core';

/**
 * The whole seconds left until a clock time, in milliseconds (null: nothing to wait for), for a
 * wait the API asked for. Counted down each second from the clock, so a tab whose timers were
 * held back still shows the time left; 0 once the time has come, and without one. A new time
 * starts again. Must run in an injection context, whose end stops the count.
 */
export function secondsUntil(until: () => number | null): Signal<number> {
  const end = computed(until);
  const now = signal(Date.now());

  effect((onCleanup) => {
    const time = end();
    if (time === null) return;
    now.set(Date.now());
    const timer = setInterval(() => {
      now.set(Date.now());
      if (Date.now() >= time) clearInterval(timer);
    }, 1000);
    onCleanup(() => {
      clearInterval(timer);
    });
  });

  // Without a time, the one waited for is long past.
  return computed(() => Math.max(0, Math.ceil(((end() ?? 0) - now()) / 1000)));
}
