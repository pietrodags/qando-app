import { Injector, inject } from '@angular/core';
import { type CanActivateFn, RedirectCommand, Router } from '@angular/router';

/**
 * The management link, `/manage/:id#t=<token>`: hands its token to this browser and opens the
 * management page without the token in the address bar, replacing the entry in the history so
 * going back never shows it either. Without a token the page opens as it is: the browser may
 * hold one from before. `EventManagement` (and the contract it reads) loads with the page.
 */
export const openManagementLink: CanActivateFn = async ({ params, fragment }) => {
  const token = new URLSearchParams(fragment ?? '').get('t');
  if (token === null) return true;
  const injector = inject(Injector);
  const page = inject(Router).createUrlTree(['/manage', String(params['eventId'])]);
  const { EventManagement } = await import('./event-management');
  injector.get(EventManagement).claim(String(params['eventId']), token);
  return new RedirectCommand(page, { replaceUrl: true });
};
