import { DOCUMENT, Service, inject } from '@angular/core';

/**
 * The browser's own navigation, for an address the app's router does not serve: one of the
 * API's, which answers by sending the browser on, or another site's.
 */
@Service()
export class WholeNavigation {
  private readonly location = inject(DOCUMENT).location;

  /** Loads `address` in place of this page: going back does not return to it. */
  replaceWith(address: string): void {
    this.location.replace(address);
  }
}
