import {
  Component,
  type ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  model,
  output,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { type CalendarWords, calendarWords } from '../../shared/ui/calendar-words';
import { type DateRange } from './date-selection';

/**
 * Saved ranges as a list of pills, each reading its first and its last day ("Lun 22 ➔ Vie 26").
 * A press on a pill pins its range, and on the pinned pill lets it go; the mouse over a pill
 * previews its range. A pill's "−" asks the page to delete its range: a mouse and the keyboard
 * find it on the pill while none is pinned, and without a mouse it is there only on the pinned
 * pill. Once the page has deleted the range, the focus goes to the pill that takes its place, or
 * to the last one; with no pill left the list has nothing to give it to.
 */
@Component({
  selector: 'app-saved-ranges',
  imports: [TranslocoPipe],
  styleUrl: './saved-ranges.scss',
  templateUrl: './saved-ranges.html',
  host: { '[class.touch]': 'touch()' },
})
export class SavedRanges {
  /** The saved ranges to show, in order. */
  readonly ranges = input.required<readonly DateRange[]>();
  /** The device has no mouse: a pill is pinned to find its "−". */
  readonly touch = input(false);
  /** The range pinned; one that is not among `ranges` shows on no pill. */
  readonly pinned = model<DateRange | null>(null);
  /** The mouse comes over the pill of a range, or leaves it (`null`). */
  readonly previewed = output<DateRange | null>();
  /** The "−" of a range is pressed: the page deletes it by taking it out of `ranges`. */
  readonly removed = output<DateRange>();

  private readonly injector = inject(Injector);
  protected readonly words: CalendarWords = calendarWords(inject(TranslocoService).getActiveLang());
  private readonly pillButtons = viewChildren<ElementRef<HTMLButtonElement>>('pillButton');

  protected pin(range: DateRange): void {
    this.pinned.update((pinned) => (pinned === range ? null : range));
  }

  /** A pointer comes over a pill; a finger's touch is not a mouse resting. */
  protected over(event: PointerEvent, range: DateRange): void {
    if (event.pointerType !== 'touch') this.previewed.emit(range);
  }

  protected remove(range: DateRange): void {
    const place = this.ranges().indexOf(range);
    this.removed.emit(range);
    afterNextRender(
      () => {
        // The page kept the range: its "−" is still there, with the focus.
        if (this.ranges().includes(range)) return;
        const pills = this.pillButtons();
        (pills[place] ?? pills.at(-1))?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }
}
