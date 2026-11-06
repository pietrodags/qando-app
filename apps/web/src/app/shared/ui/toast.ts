import { Component, Service, inject, signal } from '@angular/core';

/** How long a message stays on screen. */
const SHOWN_MS = 2000;

/** Shows a short message at the bottom of the screen ("Enlace copiado"), from any page. */
@Service()
export class Toaster {
  readonly #message = signal<string | null>(null);
  readonly message = this.#message.asReadonly();
  #timer: ReturnType<typeof setTimeout> | undefined;

  /** Shows the message, already translated, for two seconds; it replaces one still shown. */
  show(message: string): void {
    clearTimeout(this.#timer);
    this.#message.set(message);
    this.#timer = setTimeout(() => {
      this.#message.set(null);
    }, SHOWN_MS);
  }
}

/** Where the `Toaster`'s messages appear: once, in the app shell. */
@Component({
  selector: 'app-toast',
  styleUrl: './toast.scss',
  template: `
    <div role="status">
      @if (toaster.message(); as message) {
        <p class="toast">{{ message }}</p>
      }
    </div>
  `,
})
export class Toast {
  protected readonly toaster = inject(Toaster);
}
