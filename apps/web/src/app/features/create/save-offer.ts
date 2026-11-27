import {
  Component,
  ElementRef,
  Injector,
  type Signal,
  type WritableSignal,
  afterNextRender,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { DateSelection } from './date-selection';

/**
 * Without a mouse, the row over a step's arrows, always as tall so that nothing under it moves: in
 * its middle what the step puts in it (the options counter), and at its end, while some marked
 * time on screen has a "+" to show (`savable`), the button that
 * shows them all (`shown`, for each `HourColumn`'s `saving`), the first one taking the focus the
 * button had. The button gives way to them until one is pressed, the times change (as when one
 * is saved), a press lands anywhere else, or Escape, which brings the button back with the focus
 * one may have had. The "+" are looked for in the element the row is in: its step.
 */
@Component({
  selector: 'app-save-offer',
  imports: [TranslocoPipe],
  styleUrl: './save-offer.scss',
  host: {
    class: 'tools',
    '(document:keydown.escape)': 'letGo()',
    '(document:click)': 'clicked($event)',
  },
  template: `
    <div class="middle"><ng-content /></div>
    @if (savable() && !adding()) {
      <button
        type="button"
        class="adder"
        [attr.aria-label]="'create.times.showSave' | transloco"
        (click)="show()"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <!-- Heroicons outline: plus -->
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    }
  `,
})
export class SaveOffer {
  /**
   * The dates and their times: when they change the "+" hide, and the button is back. The step
   * gives the signal itself, read at each change: a press that changes the times on its way down
   * (the end of an edit) has changed them before the button hears it, and the "+" it asks for
   * stay. Not required: the step asks whether the "+" are shown before it has given it.
   */
  readonly times = input<Signal<DateSelection>>();
  /** Some day on screen has a marked time: there is a "+" to show. */
  readonly savable = input.required<boolean>();

  private readonly adding: WritableSignal<boolean> = linkedSignal<
    DateSelection | undefined,
    boolean
  >({
    source: () => this.times()?.(),
    computation: () => false,
  });
  /** The "+" of every marked time on screen are shown. */
  readonly shown: Signal<boolean> = this.adding.asReadonly();

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected show(): void {
    this.adding.set(true);
    this.focusOnceDrawn('.save.offered');
  }

  protected letGo(): void {
    if (!this.adding()) return;
    this.adding.set(false);
    this.focusOnceDrawn('.adder');
  }

  /** A click hides the "+", except on one of them, which saves, and on the button that showed them. */
  protected clicked(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.save, .adder')) this.adding.set(false);
  }

  /** The focus goes to the first of the step that matches, once the page shows it. */
  private focusOnceDrawn(selector: string): void {
    afterNextRender(
      () => {
        this.host.parentElement?.querySelector<HTMLElement>(selector)?.focus();
      },
      { injector: this.injector },
    );
  }
}
