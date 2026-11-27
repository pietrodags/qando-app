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
 * A button that asks before it acts: a trash (the calendar's, which clears every date, and each
 * day's column of the times step, which clears its times) or, given `words`, a button that shows
 * them ("Desconectar" in "Apps conectadas"). Pressed, with a mouse, a finger or the keyboard, it
 * gives way to the page's question in its place, so a slip never acts: only its "Sí" asks the page
 * to act; "No", which takes the focus, Escape or a press anywhere else take the question away.
 * "Sí", "No" and Escape give the focus back to the button. The question is on one line, its two
 * answers under it where there is no room for them beside it.
 */
@Component({
  selector: 'app-ask-first-button',
  imports: [TranslocoPipe],
  styleUrl: './ask-first-button.scss',
  templateUrl: './ask-first-button.html',
  host: {
    '[class.asking]': 'asking()',
    '(document:keydown.escape)': 'keep()',
    '(document:click)': 'clicked($event)',
  },
})
export class AskFirstButton {
  /** The button's name, for screen readers and, on a trash, for the mouse resting on it. */
  readonly label = input.required<string>();
  /** What the button shows in place of a trash. */
  readonly words = input<string>();
  /** What the button asks in its place once it is pressed. */
  readonly question = input.required<string>();
  /** The question's "Sí": the page acts. */
  readonly confirmed = output();

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly asks = signal(false);
  /** The question is on screen in the button's place. */
  readonly asking: Signal<boolean> = this.asks.asReadonly();

  private readonly button = viewChild<ElementRef<HTMLButtonElement>>('button');
  private readonly noButton = viewChild<ElementRef<HTMLButtonElement>>('noButton');

  /** The button is pressed. */
  protected press(): void {
    this.asks.set(true);
    this.focusOnceDrawn(() => this.noButton());
  }

  /** "Sí": the button is back, with the focus the question had. */
  protected confirm(): void {
    this.asks.set(false);
    this.focusOnceDrawn(() => this.button());
    this.confirmed.emit();
  }

  /** "No" or Escape: the button is back, with the focus the question had. */
  protected keep(): void {
    if (!this.asking()) return;
    this.asks.set(false);
    this.focusOnceDrawn(() => this.button());
  }

  /** A click anywhere else on the page takes the question away; what was pressed keeps the focus. */
  protected clicked(event: Event): void {
    if (!(event.target instanceof Node && this.host.contains(event.target))) this.asks.set(false);
  }

  private focusOnceDrawn(find: () => ElementRef<HTMLButtonElement> | undefined): void {
    afterNextRender(() => find()?.nativeElement.focus(), { injector: this.injector });
  }
}
