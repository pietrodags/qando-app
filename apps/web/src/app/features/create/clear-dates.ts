import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The trash that clears every date of the wizard's calendar: pressed, it asks the page to clear
 * them. A mouse and the keyboard clear with one press. Without a mouse the trash gives way to a
 * question in its place, "¿Borrar todo?", and only its "Sí" clears; "No", which takes the focus,
 * Escape or a press anywhere else take the question away, the first two giving the focus back to
 * the trash. The page shows it only while there is something to clear.
 */
@Component({
  selector: 'app-clear-dates',
  imports: [TranslocoPipe],
  styleUrl: './clear-dates.scss',
  templateUrl: './clear-dates.html',
  host: {
    '[class.asking]': 'asking()',
    '(document:keydown.escape)': 'keep()',
    '(document:click)': 'clicked($event)',
  },
})
export class ClearDates {
  /** The device has no mouse: the trash asks before it clears. */
  readonly touch = input(false);
  /** The dates are to be cleared: the trash with a mouse, or the question's "Sí". */
  readonly cleared = output();

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** The question is on screen in the trash's place. */
  protected readonly asking = signal(false);

  private readonly trashButton = viewChild<ElementRef<HTMLButtonElement>>('trashButton');
  private readonly noButton = viewChild<ElementRef<HTMLButtonElement>>('noButton');

  /** The trash is pressed. */
  protected press(): void {
    if (!this.touch()) {
      this.cleared.emit();
      return;
    }
    this.asking.set(true);
    this.focusOnceDrawn(() => this.noButton());
  }

  /** "Sí". */
  protected clear(): void {
    this.asking.set(false);
    this.cleared.emit();
  }

  /** "No" or Escape: the trash is back, with the focus the question had. */
  protected keep(): void {
    if (!this.asking()) return;
    this.asking.set(false);
    this.focusOnceDrawn(() => this.trashButton());
  }

  /** A click anywhere else on the page takes the question away; what was pressed keeps the focus. */
  protected clicked(event: Event): void {
    if (!(event.target instanceof Node && this.host.contains(event.target))) this.asking.set(false);
  }

  private focusOnceDrawn(find: () => ElementRef<HTMLButtonElement> | undefined): void {
    afterNextRender(() => find()?.nativeElement.focus(), { injector: this.injector });
  }
}
