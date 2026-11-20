import { type Signal, Directive, computed, inject, input, output, signal } from '@angular/core';
import { ElementRef } from '@angular/core';
import { screenMatches } from '../../shared/ui/screen-matches';
import { SideSlide } from '../../shared/ui/side-slide';

/** From this width (the tablet breakpoint) four columns fit; below it, three. */
const WIDE_QUERY = '(min-width: 650px)';

/**
 * Below the narrowest width a page is laid out for, two columns of their usual width: a screen
 * that narrow is mostly one whose person made everything larger to read it better.
 */
const NARROWEST_QUERY = '(max-width: 319.98px)';

/** A finger has passed a column once it has gone more than this part of the way to it. */
const PASSED = 0.25;

/**
 * How many columns a step of the wizard puts on screen at a time: four from 650 px, three
 * below, and two under 320 px. Called where a component is built.
 */
export function columnsOnScreen(): Signal<number> {
  const wide = screenMatches(WIDE_QUERY);
  const narrowest = screenMatches(NARROWEST_QUERY);
  return computed<number>(() => {
    if (wide()) return 4;
    return narrowest() ? 2 : 3;
  });
}

/**
 * The window on a step's row of columns: the element it is on holds the row (`.strip`), whose
 * children are the columns (`.column`). The row is moved to its start a column for each one
 * before the first on screen (`moved`, as `--first`). A finger that slides sideways over the
 * columns moves the row with it, at once (`withFinger`), as far as the first column and the
 * last; when it lifts the row settles on the column it brought, one for each column passed,
 * the next counting once the finger is over a quarter of the way to it, and asks for it. A row
 * that is `held` stays where it is, and a finger moves nothing.
 */
@Directive({
  selector: '[appColumnStrip]',
  exportAs: 'appColumnStrip',
  hostDirectives: [SideSlide],
})
export class ColumnStrip {
  /** The place of the first column on screen among them all, from 0. */
  readonly first = input.required<number>();
  /** How many places the first column on screen can take: 1 when every column fits. */
  readonly places = input.required<number>();
  /** The row stays where it is: a finger that slides over it moves nothing. */
  readonly held = input(false);
  /** A finger has lifted: the place of the column it brought first on screen, maybe past the ends. */
  readonly asked = output<number>();

  /** How many columns a finger sliding sideways has brought so far, part of one too; `null` without one. */
  private readonly brought = signal<number | null>(null);
  /** The row follows a finger, with no delay. */
  readonly withFinger = computed<boolean>(() => this.brought() !== null);
  /** How many columns the row is moved to its start: with the finger, never past its two ends. */
  readonly moved = computed<number>(() =>
    Math.min(Math.max(this.first() + (this.brought() ?? 0), 0), this.places() - 1),
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const slide = inject(SideSlide);
    slide.sliding.subscribe((by) => {
      if (!this.held()) this.brought.set(-by / this.stride());
    });
    slide.slid.subscribe(({ by }) => {
      if (this.held()) return;
      const passed = Math.ceil(Math.abs(by) / this.stride() - PASSED) * Math.sign(by);
      this.brought.set(null);
      this.asked.emit(this.first() - passed);
    });
  }

  /** How far a column starts from the one before it, in pixels; without a second one, no way. */
  private stride(): number {
    const [first, second] = this.host.querySelectorAll('.column');
    if (!first || !second) return Infinity;
    return second.getBoundingClientRect().left - first.getBoundingClientRect().left;
  }
}
