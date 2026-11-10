import { Component, computed, input, linkedSignal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { type RequestFailure, waiting } from '../../core/api/request-failure';

/**
 * What a page says under the button whose request failed: the plain failure, or a rate limit
 * and the time still to wait, gone at 0. Screen readers hear it once, with the seconds it
 * starts with; the count shown goes down hidden from them, since a change inside an alert (or an
 * alertdialog holding it) is read again. The page styles it through its own class on the element.
 */
@Component({
  selector: 'app-failure-notice',
  imports: [TranslocoPipe],
  styleUrl: './failure-notice.scss',
  template: `
    @if (shown(); as shown) {
      @if (shown.kind === 'failed') {
        <p>
          <span role="alert">{{ failedKey() | transloco }}</span>
        </p>
      } @else {
        <p>
          <span role="alert">
            {{ limitedKey() | transloco }}
            <span class="visually-hidden">{{
              waitKey() | transloco: wait(shown.firstSeconds)
            }}</span>
          </span>
          <span aria-hidden="true">{{ waitKey() | transloco: wait(shown.seconds) }}</span>
        </p>
      }
    }
  `,
})
export class FailureNotice {
  readonly failure = input.required<RequestFailure | null>();
  /** The catalogue key of the plain failure. */
  readonly failedKey = input.required<string>();
  /**
   * The catalogue key of the wait. It gets `{seconds}`, and for a text that tells long waits in
   * minutes, `{minutes}` (rounded up) with `{unit}`: `minutes` from one minute on, `seconds` below.
   */
  readonly waitKey = input.required<string>();
  /** The catalogue key of what the limit is; by default, too many visits from the network. */
  readonly limitedKey = input('common.rateLimited.message');

  protected wait(seconds: number): WaitParams {
    return {
      seconds,
      minutes: Math.ceil(seconds / 60),
      unit: seconds >= 60 ? 'minutes' : 'seconds',
    };
  }

  /** What shows: the plain failure, or a limit still counting with the seconds it started with. */
  protected readonly shown = computed<Shown | null>(() => {
    // Read on every change of the failure, even while nothing shows, so the end of a count is
    // seen and the next limit starts with its own seconds.
    const firstSeconds = this.firstSeconds();
    const failure = this.failure();
    if (failure?.kind === 'failed') return failure;
    return failure?.kind === 'limited' && failure.seconds > 0 ? { ...failure, firstSeconds } : null;
  });

  /** The seconds the limit shown started with: kept while it counts down, taken anew after it. */
  private readonly firstSeconds = linkedSignal<RequestFailure | null, number>({
    source: this.failure,
    computation: (failure, previous) => {
      if (failure?.kind !== 'limited') return 0;
      return previous !== undefined && waiting(previous.source) ? previous.value : failure.seconds;
    },
  });
}

type Shown =
  | { readonly kind: 'failed' }
  | { readonly kind: 'limited'; readonly seconds: number; readonly firstSeconds: number };

interface WaitParams {
  readonly seconds: number;
  readonly minutes: number;
  readonly unit: 'minutes' | 'seconds';
}
