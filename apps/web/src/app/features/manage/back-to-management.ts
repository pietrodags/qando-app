import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { OptionsSave } from './event-management';

/** Why the options the organizer saved were not: someone voted, or they were replaced meanwhile. */
export type OptionsNotSaved = Extract<OptionsSave, 'votedMeanwhile' | 'optionsOutdated'>;

/**
 * Opens the event's management page in place of the page on screen, the options editor, telling
 * it why the options were not saved when they were not, for the page to say it once.
 */
export function backToManagement(
  router: Router,
  eventId: string,
  notSaved: OptionsNotSaved | null = null,
): void {
  const told = notSaved === null ? {} : { state: { notice: notSaved } };
  void router.navigate(['/manage', eventId], { replaceUrl: true, ...told });
}

/**
 * Why the options were not saved, when the management page being built was opened by
 * `backToManagement`; null otherwise. Only a navigation made inside the app counts: a reload, or
 * a move through the history, brings the browser's saved state back, about a save long done.
 * Called while the page is built, while its navigation is still on.
 */
export function notSavedOnArrival(): OptionsNotSaved | null {
  const navigation = inject(Router).currentNavigation();
  if (navigation?.trigger !== 'imperative' || navigation.previousNavigation === null) return null;
  const notice: unknown = navigation.extras.state?.['notice'];
  return notice === 'votedMeanwhile' || notice === 'optionsOutdated' ? notice : null;
}
