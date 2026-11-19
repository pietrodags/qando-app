import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { NoticeLine } from './reading-words';

/**
 * A box that tells the organizer what came of a phrase, one line under another, with a cross that
 * asks for it to be closed: amber for what a reading tells, red (`tone="error"`) for a phrase
 * left unread. The days a line speaks of are said first, in bold. Whoever shows it puts it in a
 * live region, so that screen readers hear it when it comes.
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
