import { Component, Service, computed, inject, signal } from '@angular/core';

/** How long a message stays on screen. */
const SHOWN_MS = 2000;
/** How long one with something to do about it stays: time to read it and reach its button. */
const OFFERED_MS = 8000;

/** What a message offers to do about what it says: the words of its button, and what a press does. */
export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

/** A message on screen, and how long it stays once nothing rests on it. */
interface Shown {
  readonly text: string;
  readonly action: ToastAction | null;
  readonly ms: number;
}

/**
 * Shows a short message at the bottom of the screen, from any page, one at a time: a new one
 * takes the place of the one on screen. A message that only says ("Enlace copiado") stays two
 * seconds; one with something to do about it ("Hemos sustituido… Deshacer") stays eight, has a
 * button that does it once and takes the message away, and can be taken away early by who offered
 * it. While the mouse is over a message or the focus in it, it stays, and its whole time again
 * after.
 */
@Service()
export class Toaster {
  readonly #shown = signal<Shown | null>(null);
  /** The message on screen, already translated. */
  readonly message = computed<string | null>(() => this.#shown()?.text ?? null);
  /** What the message on screen offers to do. */
  readonly action = computed<ToastAction | null>(() => this.#shown()?.action ?? null);
  /** What rests on the message on screen and keeps it there. */
  readonly #resting = new Set<'pointer' | 'focus'>();
  #timer: ReturnType<typeof setTimeout> | undefined;

  /** Shows the message, already translated, for two seconds; it replaces one still shown. */
  show(message: string): void {
    this.#put({ text: message, action: null, ms: SHOWN_MS });
  }

  /**
   * Shows the message with a button for what can be done about it, both already translated, for
   * eight seconds. A press on the button takes the message away and then does it. Answers how to
   * take the message away before: it does nothing once the message is gone or another is in its
   * place.
   */
  offer(message: string, action: ToastAction): () => void {
    const withdraw = (): void => {
      if (this.#shown() === shown) this.#put(null);
    };
    const run = (): void => {
      withdraw();
      action.run();
    };
    const shown: Shown = { text: message, action: { label: action.label, run }, ms: OFFERED_MS };
    this.#put(shown);
    return withdraw;
  }

  /**
   * The mouse comes over the message or leaves it, or the focus comes into it or leaves it: the
   * message stays while either rests on it, and its whole time again once neither does.
   */
  rest(what: 'pointer' | 'focus', resting: boolean): void {
    if (resting) this.#resting.add(what);
    else this.#resting.delete(what);
    this.#time();
  }

  /** The message on screen from now on, or none: nothing rests on it yet. */
  #put(shown: Shown | null): void {
    this.#shown.set(shown);
    this.#resting.clear();
    this.#time();
  }

  /** The time of the message on screen starts again, unless something rests on it. */
  #time(): void {
    clearTimeout(this.#timer);
    const shown = this.#shown();
    if (shown === null || this.#resting.size > 0) return;
    this.#timer = setTimeout(() => {
      this.#shown.set(null);
    }, shown.ms);
  }
}

/** Where the `Toaster`'s messages appear: once, in the app shell. */
@Component({
  selector: 'app-toast',
  styleUrl: './toast.scss',
  template: `
    <div role="status">
      @if (toaster.message(); as message) {
        <p
          class="toast"
          (pointerenter)="toaster.rest('pointer', true)"
          (pointerleave)="toaster.rest('pointer', false)"
          (focusin)="toaster.rest('focus', true)"
          (focusout)="toaster.rest('focus', false)"
        >
          <span class="words">{{ message }}</span>
          @if (toaster.action(); as action) {
            <button type="button" class="action" (click)="action.run()">{{ action.label }}</button>
          }
        </p>
      }
    </div>
  `,
})
export class Toast {
  protected readonly toaster = inject(Toaster);
}
