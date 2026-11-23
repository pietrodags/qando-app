import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** One line of a `NoticeBox`, in the language of the page. */
export interface NoticeLine {
  /**
   * What the line speaks of, said first in bold with a colon: the days of a reading ("vie 19
   * jun"), what was not done ("No se ha confirmado la fecha"); `null` for a line about none.
   */
  readonly lead: string | null;
  /** What it says: after the lead and its colon, or a sentence of its own. */
  readonly text: string;
}

/**
 * A box that tells the organizer something, one line under another, with a cross that asks for
 * it to be closed: amber for what a reading of a phrase tells or why a date was not confirmed on
 * the management page, red (`tone="error"`) for a phrase left unread. What a line speaks of (its
 * days, what was not done) is said first, in bold. Whoever shows it puts it in a live region, so
 * that screen readers hear it when it comes.
 */
@Component({
  selector: 'app-notice-box',
  imports: [TranslocoPipe],
  styleUrl: './notice-box.scss',
  host: { '[class.error]': "tone() === 'error'" },
  template: `
    <div class="lines">
      @for (line of lines(); track $index) {
        <p>
          @if (line.lead !== null) {
            <strong>{{ line.lead }}:</strong>
          }
          {{ line.text }}
        </p>
      }
    </div>
    <button
      type="button"
      class="close"
      [attr.aria-label]="'create.phrase.closeNotice' | transloco"
      (click)="closed.emit()"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <!-- Heroicons outline: x-mark -->
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    </button>
  `,
})
export class NoticeBox {
  readonly lines = input.required<readonly NoticeLine[]>();
  readonly tone = input<'info' | 'error'>('info');
  /** The cross was pressed. */
  readonly closed = output();
}
