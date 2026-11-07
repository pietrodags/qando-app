import {
  Component,
  type ElementRef,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * A card over the whole screen, on a dark scrim, with what it is given and a round ✓ at the
 * bottom, within the thumb's reach: `<app-dialog [label]="name" (closed)="…">…</app-dialog>`. It
 * is open while it is in the page (the browser's modal `<dialog>`: the page behind cannot be
 * reached, the focus stays inside). The ✓, a tap on the scrim, Escape or back on a phone close
 * it, and `closed` asks the page to remove it; removing it says nothing.
 */
@Component({
  selector: 'app-dialog',
  imports: [TranslocoPipe],
  styleUrl: './dialog.scss',
  // The scrim is the dialog itself around the card: a tap on it lands on the dialog. Its
  // keyboard counterpart is Escape, which the browser handles.
  host: { '(click)': 'closeOnScrim($event)' },
  template: `
    <dialog #dialog [attr.aria-label]="label()" (close)="closed.emit()">
      <div class="card">
        <ng-content />
        <button
          type="button"
          class="done"
          [attr.aria-label]="'common.done' | transloco"
          (click)="dialog.close()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <!-- Heroicons outline: check -->
            <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </button>
      </div>
    </dialog>
  `,
})
export class Dialog {
  /** What screen readers call it. */
  readonly label = input.required<string>();
  /** The voter closed it: the page removes it. */
  readonly closed = output();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // In the write phase, before the page's reads: what it measures inside is already laid out.
    afterNextRender({
      write: () => {
        this.dialog().nativeElement.showModal();
      },
    });
  }

  protected closeOnScrim(event: Event): void {
    const dialog = this.dialog().nativeElement;
    if (event.target === dialog) dialog.close();
  }
}
