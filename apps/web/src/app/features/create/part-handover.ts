import { Injectable } from '@angular/core';

/**
 * The height of the times (`WizardTimes`) or of their summary (`WizardSummary`) as one gives way
 * to the other in the same card, for the one that takes its place to hold: the page does not
 * shrink under the step, so nothing on it jumps, also with the page scrolled down to the step's
 * arrows. Provided by the page that shows both in one step. Taken once: a part that comes from
 * another step holds nothing.
 */
@Injectable()
export class PartHandover {
  private height: number | null = null;

  /** The part that gives way is `height` pixels tall. */
  leave(height: number): void {
    this.height = height;
  }

  /** The height the part that gave way left, once; `null` once taken, or when none gave way. */
  take(): number | null {
    const height = this.height;
    this.height = null;
    return height;
  }
}
