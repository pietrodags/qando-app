import { Component, computed, input, model, output } from '@angular/core';
import { HoldRepeat } from './hold-repeat';

// Heroicons outline.
const ARROW_LEFT = 'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18';
const CHEVRON_LEFT = 'M15.75 19.5 8.25 12l7.5-7.5';
const ARROW_RIGHT = 'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3';
const CHEVRON_RIGHT = 'm8.25 4.5 7.5 7.5-7.5 7.5';
const CHECK = 'm4.5 12.75 6 6 9-13.5';

/** One of the two round arrows as it is now: its name and its drawing. */
interface Arrow {
  readonly label: string;
  readonly icon: string;
}

/**
 * The two round arrows that end a step whose content comes in pages: they turn the pages, and
 * only from the first and the last page do they leave the step, back or forward. Between them,
 * with several pages, the place among them ("2 / 3"), marked on the last. Each arrow is named
 * and drawn after what it does next: a chevron turns a page; an arrow, or a tick when the step
 * is the last one, leaves the step. The step holds the page, to show it, and gives the names.
 *
 * A step whose pages are short to turn asks for arrows that are `held`: a page turns as soon as
 * an arrow is pressed and another at each repeat while it stays down (`HoldRepeat`). The hold
 * stops at the first or the last page; leaving the step always takes a press of its own, which
 * acts when it ends.
 */
@Component({
  selector: 'app-step-pager',
  imports: [HoldRepeat],
  styleUrl: './step-pager.scss',
  templateUrl: './step-pager.html',
})
export class StepPager {
  /** The page on screen, from 0. */
  readonly page = model.required<number>();
  /** How many pages the step has. */
  readonly pages = input.required<number>();
  /** The name of the first arrow on the first page, where it leaves the step. */
  readonly backLabel = input.required<string>();
  /** The name of the first arrow on any later page. */
  readonly previousLabel = input.required<string>();
  /** The name of the second arrow before the last page. */
  readonly nextLabel = input.required<string>();
  /** The name of the second arrow on the last page, where it leaves the step. */
  readonly forwardLabel = input.required<string>();
  /** What the second arrow shows on the last page: an arrow, or a tick when it ends the steps. */
  readonly forwardIcon = input<'arrow' | 'check'>('arrow');
  /** Whether an arrow held down goes on turning pages. */
  readonly held = input(false);
  /** The first arrow was pressed on the first page. */
  readonly back = output();
  /** The second arrow was pressed on the last page. */
  readonly forward = output();

  protected readonly several = computed<boolean>(() => this.pages() > 1);
  protected readonly onFirst = computed<boolean>(() => this.page() <= 0);
  protected readonly onLast = computed<boolean>(() => this.page() >= this.pages() - 1);

  protected readonly first = computed<Arrow>(() =>
    this.onFirst()
      ? { label: this.backLabel(), icon: ARROW_LEFT }
      : { label: this.previousLabel(), icon: CHEVRON_LEFT },
  );
  protected readonly second = computed<Arrow>(() => {
    if (!this.onLast()) return { label: this.nextLabel(), icon: CHEVRON_RIGHT };
    return {
      label: this.forwardLabel(),
      icon: this.forwardIcon() === 'check' ? CHECK : ARROW_RIGHT,
    };
  });

  /**
   * Whether each arrow turns a page, and so acts while held. Functions, for `HoldRepeat` to ask
   * as the pages turn: the answer drawn last may be a page behind.
   */
  protected readonly turnsBack = (): boolean => this.held() && !this.onFirst();
  protected readonly turnsForward = (): boolean => this.held() && !this.onLast();

  protected goBack(): void {
    if (this.onFirst()) this.back.emit();
    else this.page.update((page) => page - 1);
  }

  protected goForward(): void {
    if (this.onLast()) this.forward.emit();
    else this.page.update((page) => page + 1);
  }
}
