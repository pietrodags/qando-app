/**
 * The screen a test runs on. jsdom answers no media query, so each test says which ones match
 * (`(min-width: 650px)`, `(pointer: coarse)`…); any other query does not. `window.matchMedia`
 * then returns real `MediaQueryList`s that read the current answer and hear its changes.
 */
export interface TestScreen {
  /** Whether `query` matches from now on; its lists send `change` when the answer changes. */
  set(query: string, matches: boolean): void;
}

/** Replaces `window.matchMedia` with one answering `matching`, changed later by `set`. */
export function installTestScreen(matching: Readonly<Record<string, boolean>> = {}): TestScreen {
  const answers = new Map(Object.entries(matching));
  const lists = new Set<TestMediaQueryList>();
  window.matchMedia = (query: string): MediaQueryList => {
    const list = new TestMediaQueryList(query, () => answers.get(query) ?? false);
    lists.add(list);
    return list;
  };
  return {
    set(query, matches) {
      const before = answers.get(query) ?? false;
      answers.set(query, matches);
      if (before === matches) return;
      for (const list of lists) if (list.media === query) list.changed();
    },
  };
}

type Listener = (this: MediaQueryList, event: MediaQueryListEvent) => unknown;

class TestMediaQueryList extends EventTarget implements MediaQueryList {
  onchange: Listener | null = null;
  private readonly legacyListeners = new Set<Listener>();

  constructor(
    readonly media: string,
    private readonly answer: () => boolean,
  ) {
    super();
  }

  get matches(): boolean {
    return this.answer();
  }

  // Deprecated in browsers, kept only because the interface has them.
  addListener(listener: Listener | null): void {
    if (listener) this.legacyListeners.add(listener);
  }

  removeListener(listener: Listener | null): void {
    if (listener) this.legacyListeners.delete(listener);
  }

  changed(): void {
    const event = new TestMediaQueryListEvent(this.media, this.matches);
    this.onchange?.call(this, event);
    this.dispatchEvent(event);
    for (const listener of this.legacyListeners) listener.call(this, event);
  }
}

/** jsdom has no `MediaQueryListEvent`: the same fields on a plain event. */
class TestMediaQueryListEvent extends Event implements MediaQueryListEvent {
  constructor(
    readonly media: string,
    readonly matches: boolean,
  ) {
    super('change');
  }
}
