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
 *
 * Given a `confirmLabel`, it asks a question instead: "Volver" and that action replace the ✓.
 * The action emits `confirmed`, then closes it like the rest; it is written in green, in red
 * when it cannot be undone, or in the darkest text (`tone`). Content that brings its own answers
 * (`ownAnswers`, a question in steps) gets neither, and closes it with `close()`; it styles them
 * with the `answers` partial.
 */
@Component({
  selector: 'app-dialog',
  imports: [TranslocoPipe],
  styleUrl: './dialog.scss',
  // The scrim is the dialog itself around the card: a tap on it lands on the dialog. Its
  // keyboard counterpart is Escape, which the browser handles.
  host: { '(click)': 'closeOnScrim($event)' },
  templateUrl: './dialog.html',
})
export class Dialog {
  /** What screen readers call it. */
  readonly label = input.required<string>();
  /** The action of a question, already translated; without it, the ✓ closes. */
  readonly confirmLabel = input<string>();
  /** The action's colour: green, red when it cannot be undone, or the darkest text. */
  readonly tone = input<DialogTone>('action');
  /** The content brings its own answers and closes it (`close()`): no ✓, no "Volver". */
  readonly ownAnswers = input(false);
  /** The action of the question was chosen; `closed` follows. */
  readonly confirmed = output();
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

  /** Closes it, as its own answers do: `closed` follows. */
  close(): void {
    this.dialog().nativeElement.close();
  }

  protected closeOnScrim(event: Event): void {
    const dialog = this.dialog().nativeElement;
    if (event.target === dialog) dialog.close();
  }
}

/**
 * The colour of a question's action: `action`, green, the usual; `danger`, red, for one that
 * cannot be undone (cancelling an event); `plain`, the darkest text, for one that is neither.
 */
export type DialogTone = 'action' | 'danger' | 'plain';
