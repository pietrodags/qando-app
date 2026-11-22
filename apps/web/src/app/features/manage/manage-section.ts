import { Component, input, model } from '@angular/core';

let nextBodyId = 0;

/**
 * A section of the management page that folds: a thin line above it, then its heading, the
 * button that opens and closes it, with a chevron turned up while open. Closed, only the heading
 * shows; what the section holds stays in the page, hidden, so whatever the organizer chose in it
 * is still there when it opens again. Closed unless what holds it opens it (`open`), which also
 * hears when the organizer opens or closes it.
 */
@Component({
  selector: 'app-manage-section',
  styleUrl: './manage-section.scss',
  template: `
    <h2>
      <button
        type="button"
        class="toggle"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="bodyId"
        (click)="open.set(!open())"
      >
        {{ heading() }}
        <!-- Heroicons outline: chevron-down -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
    </h2>
    <div class="body" [id]="bodyId" [hidden]="!open()"><ng-content /></div>
  `,
})
export class ManageSection {
  /** The section's name, as its heading reads. */
  readonly heading = input.required<string>();
  readonly open = model(false);

  protected readonly bodyId = `manage-section-${String((nextBodyId += 1))}`;
}
