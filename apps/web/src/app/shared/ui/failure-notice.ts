import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { RequestFailure } from '../../core/api/request-failure';

/**
 * What a page says under the button whose request failed: the plain failure, or a rate limit
 * and the seconds still to wait, gone at 0. Only what does not change is read out, once, never
 * each second of the count. The page styles it through its own class on the element.
 */
@Component({
  selector: 'app-failure-notice',
  imports: [TranslocoPipe],
  styleUrl: './failure-notice.scss',
  template: `
    @if (failure(); as shown) {
      @if (shown.kind === 'failed') {
        <p>
          <span role="alert">{{ failedKey() | transloco }}</span>
        </p>
      } @else if (shown.seconds > 0) {
        <p>
          <span role="alert">{{ 'common.rateLimited.message' | transloco }}</span>
          {{ waitKey() | transloco: { seconds: shown.seconds } }}
        </p>
      }
    }
  `,
})
export class FailureNotice {
  readonly failure = input.required<RequestFailure | null>();
  /** The catalogue key of the plain failure. */
  readonly failedKey = input.required<string>();
  /** The catalogue key of the wait, with `{seconds}`. */
  readonly waitKey = input.required<string>();
}
