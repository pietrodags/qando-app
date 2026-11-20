import {
  Component,
  ElementRef,
  Injector,
  type Signal,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * A trash that asks before it clears: the calendar's, which clears every date, and each day's
 * column of the times step, which clears its times. Pressed, with a mouse, a finger or the
 * keyboard, it gives way to the page's question in its place, so a slip never loses what it
 * clears: only its "Sí" asks the page to clear; "No", which takes the focus, Escape or a press
 * anywhere else take the question away, the first two giving the focus back to the trash. The
 * question is on one line, its two answers under it where there is no room for them beside it.
 * The page shows it only while there is something to clear.
 */
@Component({
  selector: 'app-clear-button',
  imports: [TranslocoPipe],
  styleUrl: './clear-button.scss',
  templateUrl: './clear-button.html',
  host: {
    '[class.asking]': 'asking()',
    '(document:keydown.escape)': 'keep()',
    '(document:click)': 'clicked($event)',
  },
})
export class ClearButton {
  /** The trash's name, for screen readers and for the mouse resting on it. */
  readonly label = input.required<string>();
  /** What the trash asks in its place once it is pressed. */
  readonly question = input.required<string>();
  /** What the trash is for is to be cleared: the question's "Sí". */
  readonly cleared = output();

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly asks = signal(false);
  /** The question is on screen in the trash's place. */
  readonly asking: Signal<boolean> = this.asks.asReadonly();

  private readonly trashButton = viewChild<ElementRef<HTMLButtonElement>>('trashButton');
  private readonly noButton = viewChild<ElementRef<HTMLButtonElement>>('noButton');

  /** The trash is pressed. */
  protected press(): void {
    this.asks.set(true);
    this.focusOnceDrawn(() => this.noButton());
  }

  /** "Sí". */
  protected clear(): void {
    this.asks.set(false);
    this.cleared.emit();
  }

  /** "No" or Escape: the trash is back, with the focus the question had. */
  protected keep(): void {
    if (!this.asking()) return;
    this.asks.set(false);
    this.focusOnceDrawn(() => this.trashButton());
  }

  /** A click anywhere else on the page takes the question away; what was pressed keeps the focus. */
  protected clicked(event: Event): void {
    if (!(event.target instanceof Node && this.host.contains(event.target))) this.asks.set(false);
  }

  private focusOnceDrawn(find: () => ElementRef<HTMLButtonElement> | undefined): void {
    afterNextRender(() => find()?.nativeElement.focus(), { injector: this.injector });
  }
}
