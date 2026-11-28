/**
 * The window's screen and scroll as a test sets them. jsdom keeps `innerWidth`, `innerHeight` and
 * `scrollY` as the window's own properties, and spec files may share one page: deleting one
 * leaves it undefined for every file that runs after. `setWindow` remembers what the window had,
 * and `restoreWindow` gives it back.
 */
type WindowValue = 'innerWidth' | 'innerHeight' | 'scrollY';

const originals = new Map<WindowValue, PropertyDescriptor | undefined>();

/** The window's `name` is `value` from now on, or what `value` reads each time it is asked. */
export function setWindow(name: WindowValue, value: number | (() => number)): void {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(window, name));
  Object.defineProperty(
    window,
    name,
    typeof value === 'number' ? { configurable: true, value } : { configurable: true, get: value },
  );
}

/** Every value `setWindow` set, back as the window had it. */
export function restoreWindow(): void {
  for (const [name, original] of originals) {
    if (original === undefined) Reflect.deleteProperty(window, name);
    else Object.defineProperty(window, name, original);
  }
  originals.clear();
}
